import { describe, expect, it } from 'vitest';
import { buildSelect, quoteIdent, quoteQualified } from '../src/query/builder.js';
import type { QueryRequest } from '../src/query/types.js';

const base = (over: Partial<QueryRequest>): QueryRequest => ({
  datasourceId: 1,
  source: { type: 'table', table: 'orders' },
  dimensions: [], measures: [], filters: [], orderBy: [],
  ...over,
});

describe('quoteIdent', () => {
  it('escapes backticks', () => {
    expect(quoteIdent('we`ird')).toBe('`we``ird`');
    expect(quoteQualified('shop.orders')).toBe('`shop`.`orders`');
  });
  it('rejects deeper qualification', () => {
    expect(() => quoteQualified('a.b.c')).toThrow();
  });
});

describe('buildSelect', () => {
  it('returns raw rows when nothing is configured', () => {
    const q = buildSelect(base({}), '`orders`', 100);
    expect(q.sql).toBe('SELECT * FROM `orders` LIMIT 101');
    expect(q.params).toEqual([]);
  });

  it('groups by dimensions with aggregated measures', () => {
    const q = buildSelect(base({
      dimensions: [{ field: 'region' }, { field: 'order_date', bucket: 'month' }],
      measures: [{ field: 'amount', agg: 'sum' }, { field: '*', agg: 'count' }],
    }), '`orders`', 5000);
    expect(q.sql).toBe(
      "SELECT `region` AS `region`, DATE_FORMAT(`order_date`, '%Y-%m') AS `order_date_month`, SUM(`amount`) AS `sum_amount`, COUNT(*) AS `count_all` FROM `orders` GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 5001",
    );
    expect(q.columns.map((c) => c.alias)).toEqual(['region', 'order_date_month', 'sum_amount', 'count_all']);
  });

  it('parametrises filters and escapes LIKE wildcards', () => {
    const q = buildSelect(base({
      measures: [{ field: 'amount', agg: 'avg' }],
      filters: [
        { field: 'status', op: 'in', values: ['paid', 'shipped'] },
        { field: 'customer', op: 'contains', value: '50%_off' },
        { field: 'amount', op: 'between', values: [10, 20] },
        { field: 'note', op: 'is_null' },
      ],
    }), '`orders`', 10);
    expect(q.sql).toContain("WHERE `status` IN (?, ?) AND `customer` LIKE ? ESCAPE '\\\\' AND `amount` BETWEEN ? AND ? AND `note` IS NULL");
    expect(q.params).toEqual(['paid', 'shipped', '%50\\%\\_off%', 10, 20]);
  });

  it('caps the limit at the server maximum', () => {
    const q = buildSelect(base({ limit: 999999, measures: [{ field: '*', agg: 'count' }] }), '`t`', 500);
    expect(q.sql.endsWith('LIMIT 501')).toBe(true);
    expect(q.limit).toBe(500);
  });

  it('orders by known aliases only', () => {
    const ok = buildSelect(base({
      dimensions: [{ field: 'region' }], measures: [{ field: 'amount', agg: 'sum' }],
      orderBy: [{ alias: 'sum_amount', direction: 'desc' }],
    }), '`t`', 10);
    expect(ok.sql).toContain('ORDER BY `sum_amount` DESC');
    expect(() => buildSelect(base({
      dimensions: [{ field: 'region' }], orderBy: [{ alias: 'nope', direction: 'asc' }],
    }), '`t`', 10)).toThrow(/unknown column/);
  });

  it('de-duplicates aliases', () => {
    const q = buildSelect(base({ measures: [{ field: 'x', agg: 'sum' }, { field: 'x', agg: 'sum' }] }), '`t`', 10);
    expect(q.columns.map((c) => c.alias)).toEqual(['sum_x', 'sum_x_2']);
  });
});
