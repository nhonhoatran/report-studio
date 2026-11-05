import { z } from 'zod';
import { execute, query, queryOne, type Row } from '../db/metadata.js';
import { badRequest, notFound } from '../lib/errors.js';
import { RESOURCE_ACTIONS, type Policy, type PolicyAction, type PolicySubject } from './abac.js';

/*
 * The access_policies table behind ABAC, read through a short cache like the roles: every
 * request that touches a dashboard or a data source asks `listPolicies()`.
 */

interface PolicyRow extends Row {
  id: number; name: string; enabled: number; effect: string; subject: string; resource: string; actions: string; row_filters: string | null;
}

const CACHE_TTL_MS = 15_000;
let cache: { at: number; policies: Policy[] } | null = null;

export const policyInputSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  effect: z.enum(['allow', 'deny']),
  subject: z.object({
    roles: z.array(z.string().min(1).max(32)).max(20).default([]),
    attributes: z.record(z.string().min(1).max(64), z.array(z.string().min(1).max(200)).min(1).max(200)).default({}),
  }).default({ roles: [], attributes: {} }),
  resource: z.object({
    type: z.enum(['dashboard', 'datasource']),
    ids: z.array(z.number().int().positive()).max(500).default([]),
  }),
  actions: z.array(z.enum(['view', 'edit', 'query', 'manage'])).min(1).max(4),
  rowFilters: z.array(z.object({ field: z.string().min(1).max(64), attribute: z.string().min(1).max(64) })).max(20).default([]),
});
export type PolicyInput = z.infer<typeof policyInputSchema>;

/** Shape checks zod cannot express: actions belong to the resource type, row filters only to data sources and only in allow policies. */
export function checkPolicyInput(p: PolicyInput): void {
  const allowed = RESOURCE_ACTIONS[p.resource.type];
  const bad = p.actions.filter((a) => !allowed.includes(a));
  if (bad.length) throw badRequest(`Actions ${bad.join(', ')} do not apply to a ${p.resource.type}`, 'policy_invalid', { actions: bad });
  if (p.rowFilters.length && p.resource.type !== 'datasource') throw badRequest('Row filters apply to data sources only', 'policy_invalid');
  if (p.rowFilters.length && p.effect !== 'allow') throw badRequest('Row filters belong to allow policies', 'policy_invalid');
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asList = <T>(v: unknown, keep: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(keep) : []);
const isString = (x: unknown): x is string => typeof x === 'string';
const isAction = (x: unknown): x is PolicyAction => x === 'view' || x === 'edit' || x === 'query' || x === 'manage';

/** A row edited by hand must not take every request down with it: anything unreadable becomes the empty form. */
function fromRow(r: PolicyRow): Policy {
  const subject = asObject(parseJson<unknown>(r.subject, {}));
  const attributes: PolicySubject['attributes'] = {};
  for (const [k, v] of Object.entries(asObject(subject.attributes))) attributes[k] = asList(v, isString);
  const resource = asObject(parseJson<unknown>(r.resource, {}));
  return {
    id: Number(r.id), name: r.name, enabled: Boolean(Number(r.enabled)), effect: r.effect === 'deny' ? 'deny' : 'allow',
    subject: { roles: asList(subject.roles, isString), attributes },
    resource: { type: resource.type === 'datasource' ? 'datasource' : 'dashboard', ids: asList(resource.ids, (x): x is number | string => typeof x === 'number' || typeof x === 'string').map(Number).filter(Number.isFinite) },
    actions: asList(parseJson<unknown>(r.actions, []), isAction),
    rowFilters: asList(parseJson<unknown>(r.row_filters, []), (x): x is { field: string; attribute: string } => !!x && typeof x === 'object' && typeof (x as { field?: unknown }).field === 'string' && typeof (x as { attribute?: unknown }).attribute === 'string'),
  };
}

export function invalidatePolicies(): void { cache = null; }

export async function listPolicies(): Promise<Policy[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.policies;
  const rows = await query<PolicyRow>('SELECT * FROM access_policies ORDER BY id');
  const policies = rows.map(fromRow);
  cache = { at: Date.now(), policies };
  return policies;
}

export async function getPolicy(id: number): Promise<Policy> {
  const row = await queryOne<PolicyRow>('SELECT * FROM access_policies WHERE id = ?', [id]);
  if (!row) throw notFound('Policy not found', 'policy_not_found');
  return fromRow(row);
}

const columns = (p: PolicyInput) => [p.name, p.enabled ? 1 : 0, p.effect, JSON.stringify(p.subject), JSON.stringify(p.resource), JSON.stringify(p.actions), p.rowFilters.length ? JSON.stringify(p.rowFilters) : null];

export async function createPolicy(input: PolicyInput, createdBy: number): Promise<Policy> {
  checkPolicyInput(input);
  const result = await execute('INSERT INTO access_policies (name, enabled, effect, subject, resource, actions, row_filters, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [...columns(input), createdBy]);
  invalidatePolicies();
  return getPolicy(result.insertId);
}

export async function updatePolicy(id: number, input: PolicyInput): Promise<Policy> {
  await getPolicy(id);
  checkPolicyInput(input);
  await execute('UPDATE access_policies SET name = ?, enabled = ?, effect = ?, subject = ?, resource = ?, actions = ?, row_filters = ? WHERE id = ?', [...columns(input), id]);
  invalidatePolicies();
  return getPolicy(id);
}

export async function deletePolicy(id: number): Promise<void> {
  await getPolicy(id);
  await execute('DELETE FROM access_policies WHERE id = ?', [id]);
  invalidatePolicies();
}
