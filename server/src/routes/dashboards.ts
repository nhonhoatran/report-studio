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

/** May this user edit the dashboard: the permission, and no policy against it. */
async function editable(user: RequestUser, id: number): Promise<boolean> {
  return hasPermission(user, 'dashboards.edit') && (await allowed(user, 'dashboard', id, 'edit'));
}

/** The dashboard's own filters, without their current values: changing those is editing, changing the rest is `dashboards.filters`. */
const filterShapes = (def: { filters?: unknown[] } | null | undefined) =>
  JSON.stringify((def?.filters ?? []).map((f) => { const { value: _v, ...rest } = (f ?? {}) as Record<string, unknown>; return rest; }));

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
  res.status(201).json({ dashboard: view(await load(result.insertId), true, true) });
});

dashboardsRouter.put('/:id', requirePermission('dashboards.edit'), async (req, res) => {
  const id = parseId(req.params.id);
  const before = await load(id);
  await authorize(req.user!, 'dashboard', id, 'edit');
  const body = parse(bodySchema, req.body);
  assertMayChangeFilters(req.user!, JSON.parse(before.definition), body.definition);
  await execute('UPDATE dashboards SET name = ?, description = ?, definition = ? WHERE id = ?', [
    body.name, body.description ?? null, JSON.stringify(body.definition), id,
  ]);
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
  res.status(201).json({ dashboard: view(await load(result.insertId), true, true) });
});

dashboardsRouter.delete('/:id', requirePermission('dashboards.edit'), async (req, res) => {
  const id = parseId(req.params.id);
  await load(id);
  await authorize(req.user!, 'dashboard', id, 'edit');
  await execute('DELETE FROM dashboards WHERE id = ?', [id]);
  res.status(204).end();
});
