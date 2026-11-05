import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, type Row } from '../db/metadata.js';
import { allowed, authorize, requireAuth, requirePermission } from '../auth/middleware.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';
import { dropPool, poolForDatasource, testConnection, translateDbError } from '../query/executor.js';
import { listColumns, listTables } from '../query/introspect.js';

export interface DatasourceRow extends Row {
  id: number; name: string; type: string; host: string; port: number; database_name: string;
  username: string; password_enc: string; use_ssl: number; created_by: number | null; created_at: string; updated_at: string;
}

export const datasourcesRouter = Router();
datasourcesRouter.use(requireAuth);

const connectionSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(3306),
  database: z.string().min(1).max(128),
  username: z.string().min(1).max(128),
  password: z.string().max(500).default(''),
  ssl: z.boolean().default(false),
});

const createSchema = connectionSchema.extend({ name: z.string().min(1).max(120) });
const updateSchema = createSchema.partial().extend({ password: z.string().max(500).optional() });

function publicView(r: DatasourceRow) {
  return {
    id: Number(r.id), name: r.name, type: r.type, host: r.host, port: Number(r.port),
    database: r.database_name, username: r.username, ssl: Boolean(Number(r.use_ssl)),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function loadDatasource(id: number): Promise<DatasourceRow> {
  const row = await queryOne<DatasourceRow>('SELECT * FROM datasources WHERE id = ?', [id]);
  if (!row) throw notFound('Data source not found', 'datasource_not_found');
  return row;
}

/** Only the sources the policies let this user query are listed. */
datasourcesRouter.get('/', requirePermission('datasources.view'), async (req, res) => {
  const rows = await query<DatasourceRow>('SELECT * FROM datasources ORDER BY name');
  const out = [];
  for (const r of rows) if (await allowed(req.user!, 'datasource', Number(r.id), 'query')) out.push(publicView(r));
  res.json({ datasources: out });
});

datasourcesRouter.get('/:id', requirePermission('datasources.view'), async (req, res) => {
  const id = parseId(req.params.id);
  const row = await loadDatasource(id);
  await authorize(req.user!, 'datasource', id, 'query');
  res.json({ datasource: publicView(row) });
});

datasourcesRouter.post('/test', requirePermission('datasources.manage'), async (req, res) => {
  const body = parse(connectionSchema.extend({ id: z.number().int().positive().optional() }), req.body);
  let password = body.password;
  if (!password && body.id) {
    // reuse the saved password when the form leaves it blank: only for whoever may manage that source,
    // and only against the saved host, port, database and user, never to a host the caller typed
    const saved = await loadDatasource(body.id);
    await authorize(req.user!, 'datasource', body.id, 'manage');
    const same = saved.host === body.host && Number(saved.port) === body.port && saved.database_name === body.database && saved.username === body.username;
    if (!same) throw forbidden('The saved password can only be tested against the saved connection', 'permission_denied', { permission: 'datasources.manage' });
    password = decrypt(saved.password_enc);
  }
  try {
    const result = await testConnection({ host: body.host, port: body.port, user: body.username, password, database: body.database, ssl: body.ssl });
    res.json({ ok: true, ...result });
  } catch (err) {
    const e = translateDbError(err);
    res.json({ ok: false, error: e.message, code: e instanceof HttpError ? e.code : undefined, details: e instanceof HttpError ? e.details : undefined });
  }
});

datasourcesRouter.post('/', requirePermission('datasources.manage'), async (req, res) => {
  const body = parse(createSchema, req.body);
  if (await queryOne('SELECT id FROM datasources WHERE name = ?', [body.name])) throw conflict('A data source with this name already exists', 'datasource_name_exists');
  const result = await execute(
    `INSERT INTO datasources (name, type, host, port, database_name, username, password_enc, use_ssl, created_by)
     VALUES (?, 'mariadb', ?, ?, ?, ?, ?, ?, ?)`,
    [body.name, body.host, body.port, body.database, body.username, encrypt(body.password), body.ssl ? 1 : 0, req.user!.id],
  );
  res.status(201).json({ datasource: publicView(await loadDatasource(result.insertId)) });
});

datasourcesRouter.put('/:id', requirePermission('datasources.manage'), async (req, res) => {
  const id = parseId(req.params.id);
  const body = parse(updateSchema, req.body);
  const current = await loadDatasource(id);
  await authorize(req.user!, 'datasource', id, 'query');
  await authorize(req.user!, 'datasource', id, 'manage');
  if (body.name && body.name !== current.name) {
    if (await queryOne('SELECT id FROM datasources WHERE name = ? AND id <> ?', [body.name, id])) throw conflict('A data source with this name already exists', 'datasource_name_exists');
  }
  await execute(
    `UPDATE datasources SET name = ?, host = ?, port = ?, database_name = ?, username = ?, password_enc = ?, use_ssl = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [
      body.name ?? current.name, body.host ?? current.host, body.port ?? current.port,
      body.database ?? current.database_name, body.username ?? current.username,
      body.password ? encrypt(body.password) : current.password_enc,
      (body.ssl ?? Boolean(Number(current.use_ssl))) ? 1 : 0, id,
    ],
  );
  dropPool(id);
  res.json({ datasource: publicView(await loadDatasource(id)) });
});

datasourcesRouter.delete('/:id', requirePermission('datasources.manage'), async (req, res) => {
  const id = parseId(req.params.id);
  await loadDatasource(id);
  await authorize(req.user!, 'datasource', id, 'query');
  await authorize(req.user!, 'datasource', id, 'manage');
  await execute('DELETE FROM datasources WHERE id = ?', [id]);
  dropPool(id);
  res.status(204).end();
});

datasourcesRouter.get('/:id/tables', requirePermission('datasources.view'), async (req, res) => {
  const id = parseId(req.params.id);
  const ds = await loadDatasource(id);
  await authorize(req.user!, 'datasource', id, 'query');
  res.json({ tables: await listTables(poolForDatasource(ds)) });
});

/** Column names of a source the user may query: a viewer's dashboard needs them to apply its filters. */
datasourcesRouter.get('/:id/tables/:table/columns', async (req, res) => {
  const id = parseId(req.params.id);
  const ds = await loadDatasource(id);
  await authorize(req.user!, 'datasource', id, 'query');
  const columns = await listColumns(poolForDatasource(ds), String(req.params.table));
  if (columns.length === 0) throw notFound('Table not found or has no columns', 'table_not_found');
  res.json({ columns });
});
