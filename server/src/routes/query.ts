import { Router } from 'express';
import { authorize, hasPermission, requireAuth, requirePermission, rowFilters, type RequestUser } from '../auth/middleware.js';
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
import { sourceInViewableDashboard } from './dashboards.js';

export const queryRouter = Router();
queryRouter.use(requireAuth);

async function resolveFrom(req: QueryRequest, user: RequestUser): Promise<string> {
  switch (req.source.type) {
    case 'table':
      return quoteQualified(req.source.table);
    case 'dataset': {
      const ds = await loadDataset(req.source.datasetId);
      if (Number(ds.datasource_id) !== req.datasourceId) throw forbidden('Dataset does not belong to this data source', 'dataset_wrong_datasource');
      return `(${ds.sql_text}) AS \`__rs_src\``;
    }
    case 'sql':
      // ad-hoc SQL is for whoever builds datasets on this source; everybody else only runs saved specs
      if (!hasPermission(user, 'datasets.manage')) throw forbidden('Ad-hoc SQL requires the datasets.manage permission', 'adhoc_sql_forbidden');
      await authorize(user, 'datasource', req.datasourceId, 'manage');
      return `(${assertReadOnlySelect(req.source.sql)}) AS \`__rs_src\``;
  }
}

/**
 * Runs one visual's query for a user: the policies must let them query the data source, and the
 * row filters those policies carry are added to the request's own filters (row-level security).
 */
export async function executeQuery(req: QueryRequest, user: RequestUser): Promise<QueryResult> {
  const ds = await loadDatasource(req.datasourceId);
  await authorize(user, 'datasource', req.datasourceId, 'query');
  // a user who only views dashboards may query only what the dashboards they may see already query
  if (!hasPermission(user, 'dashboards.edit') && !hasPermission(user, 'datasets.manage') && !(await sourceInViewableDashboard(user, req.datasourceId, req.source))) {
    throw forbidden('This source is not read by any dashboard you may view', 'source_not_in_dashboard');
  }
  const secured: QueryRequest = { ...req, filters: [...req.filters, ...(await rowFilters(user, req.datasourceId))] };
  const from = await resolveFrom(secured, user);
  const built = buildSelect(secured, from, config.query.maxRows);
  const { rows, fields, durationMs } = await runOnPool(poolForDatasource(ds), built.sql, built.params);
  const truncated = rows.length > built.limit;
  const data = (truncated ? rows.slice(0, built.limit) : rows) as Record<string, unknown>[];
  const columns = built.columns.length
    ? built.columns
    : fieldsFromPackets(fields).map((f) => ({ alias: f.name, role: 'column' as const, source: f.name }));
  return { columns, rows: data, rowCount: data.length, truncated, durationMs, sql: built.sql };
}

/** Run one visual's query. */
queryRouter.post('/', requirePermission('dashboards.view', 'dashboards.edit', 'datasets.manage'), async (req, res) => {
  const body = parse(queryRequestSchema, req.body);
  res.json(await executeQuery(body, req.user!));
});

/** Dry run: show the SQL that would be executed. */
queryRouter.post('/explain', requirePermission('dashboards.edit'), async (req, res) => {
  const body = parse(queryRequestSchema, req.body);
  await authorize(req.user!, 'datasource', body.datasourceId, 'query');
  const secured: QueryRequest = { ...body, filters: [...body.filters, ...(await rowFilters(req.user!, body.datasourceId))] };
  const from = await resolveFrom(secured, req.user!);
  const built = buildSelect(secured, from, config.query.maxRows);
  res.json({ sql: built.sql, params: built.params, columns: built.columns });
});
