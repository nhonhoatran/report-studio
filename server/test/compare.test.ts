import { describe, expect, it } from 'vitest';
import { mergePrevious, shiftDay, shiftFor, shiftedRequest } from '../src/query/compare.js';
import { buildSelect } from '../src/query/builder.js';
import type { QueryRequest, QueryResult } from '../src/query/types.js';

const base = (over: Partial<QueryRequest>): QueryRequest => ({
  datasourceId: 1, source: { type: 'table', table: 't' }, dimensions: [], measures: [], filters: [], orderBy: [], ...over,
});

describe('time comparison', () => {
  it('moves a day back by months, years and days, keeping the calendar', () => {
    expect(shiftDay('2026-10-15', { n: 1, unit: 'YEAR' })).toBe('2025-10-15');
    expect(shiftDay('2026-03-31', { n: 1, unit: 'MONTH' })).toBe('2026-03-03');
    expect(shiftDay('2026-01-01', { n: 31, unit: 'DAY' })).toBe('2025-12-01');
    expect(shiftDay('2026-10-15', { n: -1, unit: 'QUARTER' })).toBe('2027-01-15');
    expect(shiftDay('not a date', { n: 1, unit: 'DAY' })).toBe('not a date');
  });
  it('looks back a year, or one period: the filter\'s range in days, else one bucket of the grain', () => {
    expect(shiftFor('same_period_last_year', undefined)).toEqual({ n: 1, unit: 'YEAR' });
    expect(shiftFor('previous_period', { field: 'd', from: '2026-10-01', to: '2026-10-31' })).toEqual({ n: 31, unit: 'DAY' });
    expect(shiftFor('previous_period', { field: 'd', bucket: 'quarter' })).toEqual({ n: 1, unit: 'QUARTER' });
    expect(shiftFor('previous_period', undefined)).toEqual({ n: 1, unit: 'MONTH' });
  });
  it('shifts the period\'s date filters back and its dimension forward, and the SQL moves the column before bucketing', () => {
    const req = base({
      dimensions: [{ field: 'd', bucket: 'month' }, { field: 'region' }],
      measures: [{ field: 'x', agg: 'sum', compare: 'same_period_last_year' }],
      filters: [{ field: 'd', op: 'gte', value: '2026-10-01' }, { field: 'd', op: 'lt', value: '2026-11-01' }, { field: 'region', op: 'eq', value: 'North' }],
      period: { field: 'd', from: '2026-10-01', to: '2026-10-31', bucket: 'month' },
    });
    const earlier = shiftedRequest(req, shiftFor('same_period_last_year', req.period));
    expect(earlier.filters).toEqual([{ field: 'd', op: 'gte', value: '2025-10-01' }, { field: 'd', op: 'lt', value: '2025-11-01' }, { field: 'region', op: 'eq', value: 'North' }]);
    expect(earlier.dimensions[0]).toMatchObject({ field: 'd', shift: { n: 1, unit: 'YEAR' } });
    expect(earlier.measures[0]).not.toHaveProperty('compare', 'same_period_last_year');
    const sql = buildSelect(earlier, '`t`', 100).sql;
    expect(sql).toContain("DATE_FORMAT(DATE_ADD(`d`, INTERVAL 1 YEAR), '%Y-%m') AS `d_month`");
    expect(sql).toContain('WHERE `d` >= ? AND `d` < ? AND `region` = ?');
  });
  it('joins the earlier period by dimension values into _prev and _change, empty where there is nothing earlier', () => {
    const measures: QueryRequest['measures'] = [{ field: 'x', agg: 'sum', compare: 'previous_period' }, { field: 'y', agg: 'sum' }];
    const columns: QueryResult['columns'] = [{ alias: 'd_month', role: 'dimension', source: 'd' }, { alias: 'sum_x', role: 'measure', source: 'x' }, { alias: 'sum_y', role: 'measure', source: 'y' }];
    const current: QueryResult = { columns, rows: [{ d_month: '2026-10', sum_x: 120, sum_y: 1 }, { d_month: '2026-11', sum_x: 80, sum_y: 1 }], rowCount: 2, truncated: false, durationMs: 1, sql: '' };
    const previous: QueryResult = { columns, rows: [{ d_month: '2026-10', sum_x: 100, sum_y: 1 }], rowCount: 1, truncated: false, durationMs: 1, sql: '' };
    const merged = mergePrevious(current, previous, measures);
    expect(merged.columns.map((c) => c.alias)).toEqual(['d_month', 'sum_x', 'sum_y', 'sum_x_prev', 'sum_x_change']);
    expect(merged.rows[0]).toMatchObject({ sum_x_prev: 100, sum_x_change: 0.2 });
    expect(merged.rows[1]).toMatchObject({ sum_x_prev: null, sum_x_change: null });
  });
});

describe('running totals', () => {
  it('accumulates along the date dimension within the other dimensions', () => {
    const q = buildSelect(base({
      dimensions: [{ field: 'region' }, { field: 'd', bucket: 'month' }],
      measures: [{ field: 'x', agg: 'sum', cumulative: true }],
      period: { field: 'd', bucket: 'month' },
    }), '`t`', 100);
    expect(q.sql).toContain("SUM(SUM(`x`)) OVER (PARTITION BY `region` ORDER BY DATE_FORMAT(`d`, '%Y-%m') ROWS UNBOUNDED PRECEDING) AS `sum_x`");
  });
  it('follows the first bucketed dimension when no period names one, and stays plain without any date', () => {
    const withBucket = buildSelect(base({ dimensions: [{ field: 'd', bucket: 'day' }], measures: [{ field: 'x', agg: 'sum', cumulative: true }] }), '`t`', 100);
    expect(withBucket.sql).toContain("SUM(SUM(`x`)) OVER (ORDER BY DATE_FORMAT(`d`, '%Y-%m-%d') ROWS UNBOUNDED PRECEDING)");
    const plain = buildSelect(base({ dimensions: [{ field: 'region' }], measures: [{ field: 'x', agg: 'sum', cumulative: true }] }), '`t`', 100);
    expect(plain.sql).toContain('SUM(`x`) AS `sum_x`');
  });
});
