import { Router } from 'express';
import { authorize, hasPermission, requireAuth, requirePermission, rowFilters, type RequestUser } from '../auth/middleware.js';
import { config } from '../config.js';
import { forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { buildSelect, extractSubtotals, extractTotals, quoteQualified } from '../query/builder.js';
import { poolForDatasource, runOnPool } from '../query/executor.js';
import { ResultCache, resultCache } from '../query/cache.js';
import { fieldsFromPackets } from '../query/introspect.js';
import { assertReadOnlySelect } from '../query/sqlGuard.js';
import { queryRequestSchema, type QueryRequest, type QueryResult } from '../query/types.js';
import { measuresToCompare, mergePrevious, shiftFor, shiftedRequest } from '../query/compare.js';
import { loadDataset } from './datasets.js';
import { loadDatasource, type DatasourceRow } from './datasources.js';
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

interface RunOutcome { rows: Record<string, unknown>[]; truncated: boolean; durationMs: number; dataAt: string; fromCache: boolean; columns: QueryResult['columns']; totals?: QueryResult['totals']; subtotals?: QueryResult['subtotals']; sql: string }

/** Builds and runs one request on a source, through the result cache (keyed by the SQL and every parameter, the user's row filters included). */
async function runRequest(ds: DatasourceRow, req: QueryRequest, from: string, fresh: boolean | undefined): Promise<RunOutcome> {
  const built = buildSelect(req, from, config.query.maxRows);
  const ttl = ds.cache_ttl_seconds === null || ds.cache_ttl_seconds === undefined ? config.query.cacheTtlSeconds : Number(ds.cache_ttl_seconds);
  const key = ResultCache.key(req.datasourceId, built.sql, built.params);
  if (!fresh && ttl > 0) {
    const hit = resultCache.get(key);
    if (hit) return { ...hit.value, fromCache: true, dataAt: hit.value.dataAt ?? new Date(hit.storedAt).toISOString() };
  }
  const { rows, fields, durationMs } = await runOnPool(poolForDatasource(ds), built.sql, built.params);
  const truncated = rows.length > built.limit;
  const kept = (truncated ? rows.slice(0, built.limit) : rows) as Record<string, unknown>[];
  // totals and subtotals were computed by the source over every group, including those beyond the row limit
  const { rows: withoutTotals, totals } = extractTotals(kept, built.totals);
  const { rows: data, subtotals } = extractSubtotals(withoutTotals, built.subtotals);
  const columns = built.columns.length
    ? built.columns
    : fieldsFromPackets(fields).map((f) => ({ alias: f.name, role: 'column' as const, source: f.name }));
  const dataAt = new Date().toISOString();
  const result: QueryResult = { columns, rows: data, rowCount: data.length, truncated, durationMs, sql: built.sql, totals, subtotals, dataAt };
  if (ttl > 0) resultCache.set(key, result, ttl);
  return { ...result, dataAt, fromCache: false };
}

/**
 * Runs one visual's query for a user: the policies must let them query the data source, and the
 * row filters those policies carry are added to the request's own filters (row-level security).
 * Top N and time comparisons take extra statements, assembled here.
 */
export async function executeQuery(req: QueryRequest, user: RequestUser): Promise<QueryResult> {
  const ds = await loadDatasource(req.datasourceId);
  await authorize(user, 'datasource', req.datasourceId, 'query');
  // a user who only views dashboards may query only what the dashboards they may see already query
  if (!hasPermission(user, 'dashboards.edit') && !hasPermission(user, 'datasets.manage') && !(await sourceInViewableDashboard(user, req.datasourceId, req.source))) {
    throw forbidden('This source is not read by any dashboard you may view', 'source_not_in_dashboard');
  }
  let secured: QueryRequest = { ...req, filters: [...req.filters, ...(await rowFilters(user, req.datasourceId))] };
  const from = await resolveFrom(secured, user);
  const outcomes: RunOutcome[] = [];
  const run = async (r: QueryRequest) => { const o = await runRequest(ds, r, from, req.fresh); outcomes.push(o); return o; };

  // Top N: the first dimension's leading values by the first measure, the rest gathered into one "others" row
  let othersRow: Record<string, unknown> | undefined; let othersRows: Record<string, unknown>[] = [];
  const first = secured.dimensions[0];
  const topN = secured.topN && first && (!first.bucket || first.bucket === 'none') && secured.measures.length ? secured.topN : undefined;
  if (topN && first) {
    const ranking = await run({ ...secured, dimensions: [first], measures: [secured.measures[0]!], orderBy: [], limit: topN.n, offset: undefined, topN: undefined, totals: undefined, subtotals: undefined });
    const rankMeasure = ranking.columns[1]!.alias;
    const ordered = [...ranking.rows].sort((a, b) => Number(b[rankMeasure] ?? -Infinity) - Number(a[rankMeasure] ?? -Infinity));
    // the ranking statement was only limited, not ordered by the measure: read every group's value, then keep the top n
    const keys = ordered.slice(0, topN.n).map((r) => r[ranking.columns[0]!.alias]).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number');
    secured = { ...secured, filters: [...secured.filters, { field: first.field, op: 'in', values: keys }], topN: undefined };
    if (topN.others) {
      const rest = await run({ ...secured, dimensions: secured.dimensions.slice(1), filters: [...secured.filters.slice(0, -1), { field: first.field, op: 'not_in', values: keys }], orderBy: [], offset: undefined, totals: undefined, subtotals: undefined });
      othersRows = rest.rows.map((r) => ({ ...r, [ranking.columns[0]!.alias]: null, __rs_others: true }));
      othersRow = othersRows[0];
    }
  }

  const main = await run(secured);
  let result: QueryResult = { columns: main.columns, rows: main.rows, rowCount: main.rows.length, truncated: main.truncated, durationMs: main.durationMs, sql: main.sql, totals: main.totals, subtotals: main.subtotals, dataAt: main.dataAt, fromCache: main.fromCache };
  if (othersRow !== undefined || othersRows.length) result = { ...result, rows: [...result.rows, ...othersRows], rowCount: result.rows.length + othersRows.length };

  // time comparison: the same statement over the earlier period, joined by dimension values
  if (secured.period && measuresToCompare(secured.measures)) {
    const compare = secured.measures.find((m) => m.compare)!.compare!;
    const earlier = await run(shiftedRequest(secured, shiftFor(compare, secured.period)));
    result = mergePrevious(result, { ...earlier, rowCount: earlier.rows.length }, secured.measures);
  }

  const durationMs = outcomes.reduce((sum, o) => sum + (o.fromCache ? 0 : o.durationMs), 0);
  const dataAt = outcomes.map((o) => o.dataAt).sort()[0] ?? result.dataAt;
  return { ...result, rowCount: result.rows.length, durationMs, dataAt, fromCache: outcomes.every((o) => o.fromCache) };
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
