import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, type Row } from '../db/metadata.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';
import { poolForDatasource } from '../query/executor.js';
import { describeSql } from '../query/introspect.js';
import { assertReadOnlySelect } from '../query/sqlGuard.js';
import { loadDatasource } from './datasources.js';

export interface DatasetRow extends Row {
  id: number; datasource_id: number; name: string; description: string | null; sql_text: string;
  created_by: number | null; created_at: string; updated_at: string;
}

export const datasetsRouter = Router();
datasetsRouter.use(requireAuth);

const bodySchema = z.object({
  datasourceId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  sql: z.string().min(1).max(100_000),
});

function view(r: DatasetRow) {
  return {
    id: Number(r.id), datasourceId: Number(r.datasource_id), name: r.name, description: r.description ?? '',
    sql: r.sql_text, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function loadDataset(id: number): Promise<DatasetRow> {
  const row = await queryOne<DatasetRow>('SELECT * FROM datasets WHERE id = ?', [id]);
  if (!row) throw notFound('Dataset not found');
  return row;
}

datasetsRouter.get('/', async (req, res) => {
  const dsId = req.query.datasourceId ? parseId(String(req.query.datasourceId)) : null;
  const rows = dsId
    ? await query<DatasetRow>('SELECT * FROM datasets WHERE datasource_id = ? ORDER BY name', [dsId])
    : await query<DatasetRow>('SELECT * FROM datasets ORDER BY name');
  res.json({ datasets: rows.map(view) });
});

datasetsRouter.get('/:id', async (req, res) => {
  res.json({ dataset: view(await loadDataset(parseId(req.params.id))) });
});

/** Validate SQL and return its output columns without saving. */
datasetsRouter.post('/preview-fields', requireRole('editor'), async (req, res) => {
  const body = parse(z.object({ datasourceId: z.number().int().positive(), sql: z.string().min(1) }), req.body);
  const ds = await loadDatasource(body.datasourceId);
  res.json({ fields: await describeSql(poolForDatasource(ds), body.sql) });
});

datasetsRouter.get('/:id/fields', async (req, res) => {
  const dataset = await loadDataset(parseId(req.params.id));
  const ds = await loadDatasource(Number(dataset.datasource_id));
  res.json({ fields: await describeSql(poolForDatasource(ds), dataset.sql_text) });
});

datasetsRouter.post('/', requireRole('editor'), async (req, res) => {
  const body = parse(bodySchema, req.body);
  const ds = await loadDatasource(body.datasourceId);
  const sql = assertReadOnlySelect(body.sql);
  await describeSql(poolForDatasource(ds), sql); // fail early on invalid SQL
  if (await queryOne('SELECT id FROM datasets WHERE datasource_id = ? AND name = ?', [body.datasourceId, body.name])) {
    throw conflict('A dataset with this name already exists on this data source');
  }
  const result = await execute(
    'INSERT INTO datasets (datasource_id, name, description, sql_text, created_by) VALUES (?, ?, ?, ?, ?)',
    [body.datasourceId, body.name, body.description ?? null, sql, req.user!.id],
  );
  res.status(201).json({ dataset: view(await loadDataset(result.insertId)) });
});

datasetsRouter.put('/:id', requireRole('editor'), async (req, res) => {
  const id = parseId(req.params.id);
  const current = await loadDataset(id);
  const body = parse(bodySchema.partial(), req.body);
  const datasourceId = body.datasourceId ?? Number(current.datasource_id);
  const ds = await loadDatasource(datasourceId);
  const sql = body.sql ? assertReadOnlySelect(body.sql) : current.sql_text;
  if (body.sql) await describeSql(poolForDatasource(ds), sql);
  await execute(
    'UPDATE datasets SET datasource_id = ?, name = ?, description = ?, sql_text = ? WHERE id = ?',
    [datasourceId, body.name ?? current.name, body.description === undefined ? current.description : body.description, sql, id],
  );
  res.json({ dataset: view(await loadDataset(id)) });
});

datasetsRouter.delete('/:id', requireRole('editor'), async (req, res) => {
  const id = parseId(req.params.id);
  await loadDataset(id);
  await execute('DELETE FROM datasets WHERE id = ?', [id]);
  res.status(204).end();
});
