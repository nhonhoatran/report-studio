import type { Filter } from '../query/types.js';

/*
 * ABAC: access policies evaluated against the signed-in user's attributes.
 *
 * A policy names who it is about (roles and/or attribute values), what it is about (dashboards or
 * data sources, all of them or a list of ids), which actions, and whether it allows or denies.
 * A data-source policy may also carry row filters: `field IN (the user's values of attribute)`,
 * appended to every query the user runs on that source — row-level security.
 *
 * Decision, after RBAC has already granted the permission:
 *   1. any matching *deny* wins;
 *   2. a resource that some *allow* policy lists by id is restricted to the subjects those
 *      policies match — nobody else, even with the permission;
 *   3. otherwise the permission stands.
 */

export type ResourceType = 'dashboard' | 'datasource';
export type PolicyAction = 'view' | 'edit' | 'query' | 'manage';
export const RESOURCE_ACTIONS: Record<ResourceType, PolicyAction[]> = { dashboard: ['view', 'edit'], datasource: ['query', 'manage'] };

/** A user's attributes: every value as a list, so "region = HN" and "region in (HN, DN)" are one shape. */
export type Attributes = Record<string, string[]>;

export interface PolicySubject {
  /** empty: any role */
  roles: string[];
  /** every listed attribute must match: the user has the key and one of its values is listed (`*` = any value) */
  attributes: Record<string, string[]>;
}
export interface PolicyResource { type: ResourceType; /** empty: every resource of the type */ ids: number[] }
export interface RowFilter { field: string; attribute: string }
export interface Policy {
  id: number; name: string; enabled: boolean; effect: 'allow' | 'deny';
  subject: PolicySubject; resource: PolicyResource; actions: PolicyAction[]; rowFilters: RowFilter[];
}

export interface Subject { role: string; attributes: Attributes }

export function subjectMatches(p: PolicySubject, s: Subject): boolean {
  if (p.roles.length && !p.roles.includes(s.role)) return false;
  for (const [key, wanted] of Object.entries(p.attributes)) {
    const have = s.attributes[key] ?? [];
    if (!have.length) return false;
    if (wanted.includes('*')) continue;
    if (!wanted.some((w) => have.includes(w))) return false;
  }
  return true;
}

const resourceMatches = (r: PolicyResource, type: ResourceType, id: number) => r.type === type && (r.ids.length === 0 || r.ids.includes(id));

export function decide(policies: Policy[], subject: Subject, type: ResourceType, id: number, action: PolicyAction): 'allow' | 'deny' {
  const live = policies.filter((p) => p.enabled && p.resource.type === type && p.actions.includes(action));
  const applicable = live.filter((p) => resourceMatches(p.resource, type, id) && subjectMatches(p.subject, subject));
  if (applicable.some((p) => p.effect === 'deny')) return 'deny';
  // an explicit allow list on this very resource closes it to everybody the list does not name
  const listed = live.some((p) => p.effect === 'allow' && p.resource.ids.includes(id));
  if (listed && !applicable.some((p) => p.effect === 'allow')) return 'deny';
  return 'allow';
}

/** The row filters every matching allow policy adds for this data source; a missing attribute yields no rows (`IN ()` → `1 = 0`). */
export function rowFiltersFor(policies: Policy[], subject: Subject, datasourceId: number): Filter[] {
  const out: Filter[] = [];
  for (const p of policies) {
    if (!p.enabled || p.effect !== 'allow' || !p.rowFilters.length) continue;
    if (!resourceMatches(p.resource, 'datasource', datasourceId) || !subjectMatches(p.subject, subject)) continue;
    for (const rf of p.rowFilters) {
      const values = subject.attributes[rf.attribute] ?? [];
      out.push({ field: rf.field, op: 'in', values });
    }
  }
  return out;
}

/** Attribute bags arrive as JSON from the admin UI or the database: keep strings and string lists only. */
export function normalizeAttributes(raw: unknown): Attributes {
  const out: Attributes = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim().slice(0, 64);
    if (!k) continue;
    const list = (Array.isArray(value) ? value : [value]).map((v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v)).filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
    if (list.length) out[k] = Array.from(new Set(list)).slice(0, 200);
  }
  return out;
}
