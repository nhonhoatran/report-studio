import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { config } from '../config.js';
import { forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { buildSelect, quoteQualified } from '../query/builder.js';
import { poolForDatasource, runOnPool } from '../query/executor.js';
import { fieldsFromPackets } from '../query/introspect.js';
import { assertReadOnlySelect } from '../query/sqlGuard.js';
import { queryRequestSchema, type QueryRequest, type QueryResult } from '../query/types.js';
import { loadDataset } from './datasets.js';
import { loadDatasource } from './datasources.js';

export const queryRouter = Router();
queryRouter.use(requireAuth);

async function resolveFrom(req: QueryRequest, role: string): Promise<string> {
  switch (req.source.type) {
    case 'table':
      return quoteQualified(req.source.table);
    case 'dataset': {
      const ds = await loadDataset(req.source.datasetId);
      if (Number(ds.datasource_id) !== req.datasourceId) throw forbidden('Dataset does not belong to this data source');
      return `(${ds.sql_text}) AS \`__rs_src\``;
    }
    case 'sql':
      // ad-hoc SQL is for editors building a dataset; viewers only run saved specs
      if (role === 'viewer') throw forbidden('Ad-hoc SQL requires editor role');
      return `(${assertReadOnlySelect(req.source.sql)}) AS \`__rs_src\``;
  }
}

export async function executeQuery(req: QueryRequest, role: string): Promise<QueryResult> {
  const ds = await loadDatasource(req.datasourceId);
  const from = await resolveFrom(req, role);
  const built = buildSelect(req, from, config.query.maxRows);
  const { rows, fields, durationMs } = await runOnPool(poolForDatasource(ds), built.sql, built.params);
  const truncated = rows.length > built.limit;
  const data = (truncated ? rows.slice(0, built.limit) : rows) as Record<string, unknown>[];
  const columns = built.columns.length
    ? built.columns
    : fieldsFromPackets(fields).map((f) => ({ alias: f.name, role: 'column' as const, source: f.name }));
  return { columns, rows: data, rowCount: data.length, truncated, durationMs, sql: built.sql };
}

/** Run one visual's query. */
queryRouter.post('/', async (req, res) => {
  const body = parse(queryRequestSchema, req.body);
  res.json(await executeQuery(body, req.user!.role));
});

/** Dry run: show the SQL that would be executed. */
queryRouter.post('/explain', requireRole('editor'), async (req, res) => {
  const body = parse(queryRequestSchema, req.body);
  const from = await resolveFrom(body, req.user!.role);
  const built = buildSelect(body, from, config.query.maxRows);
  res.json({ sql: built.sql, params: built.params, columns: built.columns });
});
