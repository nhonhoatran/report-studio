import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, type Row } from '../db/metadata.js';
import { allowed, authorize, hasPermission, requireAuth, requirePermission, type RequestUser } from '../auth/middleware.js';
import { forbidden, notFound } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';

interface DashboardRow extends Row {
  id: number; name: string; description: string | null; definition: string;
  created_by: number | null; created_at: string; updated_at: string; widget_count?: number;
}

export const dashboardsRouter = Router();
dashboardsRouter.use(requireAuth);

// The definition is an opaque JSON document owned by the web client (widgets, layout,
// per-widget query spec). The server only enforces shape and size.
const definitionSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(32),
    title: z.string().max(200),
    layout: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    datasourceId: z.number().int().positive().nullable(),
    source: z.unknown().nullable(),
    query: z.unknown(),
    options: z.record(z.unknown()).default({}),
  })).max(100),
  filters: z.array(z.unknown()).max(50).default([]),
  settings: z.record(z.unknown()).default({}),
});

const bodySchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional().nullable(),
  definition: definitionSchema,
});

function view(r: DashboardRow, withDefinition: boolean, canEdit: boolean) {
  const definition = withDefinition ? JSON.parse(r.definition) : undefined;
  return {
    id: Number(r.id), name: r.name, description: r.description ?? '',
    widgetCount: withDefinition ? (definition.widgets?.length ?? 0) : Number(r.widget_count ?? 0),
    createdAt: r.created_at, updatedAt: r.updated_at, definition, canEdit,
  };
}

/** May this user edit the dashboard: the permission, and no policy against seeing or editing it (editing implies seeing). */
async function editable(user: RequestUser, id: number): Promise<boolean> {
  return hasPermission(user, 'dashboards.edit') && (await allowed(user, 'dashboard', id, 'view')) && (await allowed(user, 'dashboard', id, 'edit'));
}

/** JSON with sorted keys and no undefined, so two documents that mean the same compare equal. */
function canonical(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, val]) => val !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, val]) => [k, sort(val)]));
    return x;
  };
  return JSON.stringify(sort(v));
}

/** The dashboard's own filters, without their current values: changing those is editing, changing the rest is `dashboards.filters`. */
const filterShapes = (def: { filters?: unknown[] } | null | undefined) =>
  canonical((def?.filters ?? []).map((f) => { const { value: _v, ...rest } = (f ?? {}) as Record<string, unknown>; return rest; }));

/*
 * The sources (data source + table / dataset) every dashboard reads, through a short cache: a user
 * who may only view dashboards is confined to querying what the dashboards they may see already query.
 */
const SOURCES_TTL_MS = 15_000;
let sourcesCache: { at: number; byDashboard: Map<number, Set<string>> } | null = null;
export const sourceKey = (datasourceId: number, source: unknown): string | null => {
  const s = source as { type?: string; table?: string; datasetId?: number } | null;
  if (!s) return null;
  if (s.type === 'table' && typeof s.table === 'string') return `${datasourceId}|table:${s.table}`;
  if (s.type === 'dataset' && typeof s.datasetId === 'number') return `${datasourceId}|dataset:${s.datasetId}`;
  return null;
};
async function sourcesByDashboard(): Promise<Map<number, Set<string>>> {
  if (sourcesCache && Date.now() - sourcesCache.at < SOURCES_TTL_MS) return sourcesCache.byDashboard;
  const rows = await query<DashboardRow>('SELECT id, definition FROM dashboards');
  const byDashboard = new Map<number, Set<string>>();
  for (const r of rows) {
    const keys = new Set<string>();
    try {
      const def = JSON.parse(r.definition) as { widgets?: { datasourceId?: number; source?: unknown }[]; filters?: { datasourceId?: number; source?: unknown }[] };
      for (const item of [...(def.widgets ?? []), ...(def.filters ?? [])]) {
        const k = typeof item?.datasourceId === 'number' ? sourceKey(item.datasourceId, item.source) : null;
        if (k) keys.add(k);
      }
    } catch { /* an unreadable definition reads nothing */ }
    byDashboard.set(Number(r.id), keys);
  }
  sourcesCache = { at: Date.now(), byDashboard };
  return byDashboard;
}
export function invalidateSources(): void { sourcesCache = null; }

/** Is this source read by a dashboard the user may view? */
export async function sourceInViewableDashboard(user: RequestUser, datasourceId: number, source: unknown): Promise<boolean> {
  const key = sourceKey(datasourceId, source);
  if (!key) return false;
  for (const [id, keys] of await sourcesByDashboard()) {
    if (keys.has(key) && (await allowed(user, 'dashboard', id, 'view'))) return true;
  }
  return false;
}

function assertMayChangeFilters(user: RequestUser, before: unknown, after: unknown): void {
  if (hasPermission(user, 'dashboards.filters')) return;
  if (filterShapes(before as { filters?: unknown[] }) !== filterShapes(after as { filters?: unknown[] })) {
    throw forbidden('Only a user with the dashboards.filters permission may add, change or remove dashboard filters', 'permission_denied', { permission: 'dashboards.filters' });
  }
}

async function load(id: number): Promise<DashboardRow> {
  const row = await queryOne<DashboardRow>('SELECT * FROM dashboards WHERE id = ?', [id]);
  if (!row) throw notFound('Dashboard not found', 'dashboard_not_found');
  return row;
}

/** Only the dashboards the policies let this user view are listed. */
dashboardsRouter.get('/', requirePermission('dashboards.view'), async (req, res) => {
  const rows = await query<DashboardRow>(
    `SELECT id, name, description, created_by, created_at, updated_at, '' AS definition,
            JSON_LENGTH(JSON_EXTRACT(definition, '$.widgets')) AS widget_count
       FROM dashboards ORDER BY updated_at DESC`);
  const out = [];
  for (const r of rows) {
    if (!(await allowed(req.user!, 'dashboard', Number(r.id), 'view'))) continue;
    out.push(view(r, false, await editable(req.user!, Number(r.id))));
  }
  res.json({ dashboards: out });
});

dashboardsRouter.get('/:id', requirePermission('dashboards.view'), async (req, res) => {
  const id = parseId(req.params.id);
  const row = await load(id);
  await authorize(req.user!, 'dashboard', id, 'view');
  res.json({ dashboard: view(row, true, await editable(req.user!, id)) });
});

dashboardsRouter.post('/', requirePermission('dashboards.edit'), async (req, res) => {
  const body = parse(bodySchema, req.body);
  assertMayChangeFilters(req.user!, { filters: [] }, body.definition);
  const result = await execute(
    'INSERT INTO dashboards (name, description, definition, created_by) VALUES (?, ?, ?, ?)',
    [body.name, body.description ?? null, JSON.stringify(body.definition), req.user!.id],
  );
  invalidateSources();
  res.status(201).json({ dashboard: view(await load(result.insertId), true, true) });
});

dashboardsRouter.put('/:id', requirePermission('dashboards.edit'), async (req, res) => {
  const id = parseId(req.params.id);
  const before = await load(id);
  await authorize(req.user!, 'dashboard', id, 'view');
  await authorize(req.user!, 'dashboard', id, 'edit');
  const body = parse(bodySchema, req.body);
  assertMayChangeFilters(req.user!, JSON.parse(before.definition), body.definition);
  await execute('UPDATE dashboards SET name = ?, description = ?, definition = ? WHERE id = ?', [
    body.name, body.description ?? null, JSON.stringify(body.definition), id,
  ]);
  invalidateSources();
  res.json({ dashboard: view(await load(id), true, true) });
});

dashboardsRouter.post('/:id/duplicate', requirePermission('dashboards.edit'), async (req, res) => {
  const id = parseId(req.params.id);
  const src = await load(id);
  await authorize(req.user!, 'dashboard', id, 'view');
  const result = await execute(
    'INSERT INTO dashboards (name, description, definition, created_by) VALUES (?, ?, ?, ?)',
    [`${src.name} (copy)`, src.description, src.definition, req.user!.id],
  );
  invalidateSources();
  res.status(201).json({ dashboard: view(await load(result.insertId), true, true) });
});

dashboardsRouter.delete('/:id', requirePermission('dashboards.edit'), async (req, res) => {
  const id = parseId(req.params.id);
  await load(id);
  await authorize(req.user!, 'dashboard', id, 'view');
  await authorize(req.user!, 'dashboard', id, 'edit');
  await execute('DELETE FROM dashboards WHERE id = ?', [id]);
  invalidateSources();
  res.status(204).end();
});
