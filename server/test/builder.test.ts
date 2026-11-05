import { describe, expect, it } from 'vitest';
import { buildSelect, extractSubtotals, extractTotals, quoteIdent, quoteQualified } from '../src/query/builder.js';
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

describe('calculated measures', () => {
  const measures: QueryRequest['measures'] = [
    { field: 'profit', agg: 'sum' },
    { field: 'revenue', agg: 'sum', label: 'Doanh số' },
    { formula: '[sum_profit] / [Doanh số]', alias: 'margin' },
  ];

  it('evaluates a formula after GROUP BY and turns a division into a NULLIF', () => {
    const q = buildSelect(base({ dimensions: [{ field: 'region' }], measures }), '`t`', 100);
    expect(q.sql).toBe(
      'SELECT `region` AS `region`, SUM(`profit`) AS `sum_profit`, SUM(`revenue`) AS `sum_revenue`, (SUM(`profit`) / NULLIF(SUM(`revenue`), 0)) AS `margin` FROM `t` GROUP BY 1 ORDER BY 1 LIMIT 101',
    );
    expect(q.columns).toEqual([
      { alias: 'region', role: 'dimension', source: 'region' },
      { alias: 'sum_profit', role: 'measure', source: 'profit' },
      { alias: 'sum_revenue', role: 'measure', source: 'revenue' },
      { alias: 'margin', role: 'measure', source: undefined },
    ]);
  });

  it('sends typed numbers as parameters, before the WHERE parameters', () => {
    const q = buildSelect(base({
      measures: [{ formula: 'sum(a) * 100 / count(*) - 0.5', alias: 'score' }],
      filters: [{ field: 'status', op: 'eq', value: 'paid' }],
    }), '`t`', 100);
    expect(q.sql).toBe('SELECT (((SUM(`a`) * ?) / NULLIF(COUNT(*), 0)) - ?) AS `score` FROM `t` WHERE `status` = ? LIMIT 101');
    expect(q.params).toEqual([100, 0.5, 'paid']);
  });

  it('inlines a formula that uses another formula and names an unknown reference', () => {
    const q = buildSelect(base({ measures: [...measures, { formula: '[margin] * 2', alias: 'double' }] }), '`t`', 100);
    expect(q.sql).toContain('(((SUM(`profit`) / NULLIF(SUM(`revenue`), 0))) * ?) AS `double`');
    expect(() => buildSelect(base({ measures: [{ formula: '[nope] + 1' }] }), '`t`', 100)).toThrow(/Invalid formula/);
    expect(() => buildSelect(base({ measures: [{ formula: '1 +', alias: 'x' }] }), '`t`', 100)).toThrow(/unexpected_end at 3/);
  });

  it('gives an unnamed formula a stable alias and lets ORDER BY use it', () => {
    const q = buildSelect(base({ dimensions: [{ field: 'r' }], measures: [{ formula: 'sum(a) + 1' }], orderBy: [{ alias: 'formula_1', direction: 'desc' }] }), '`t`', 100);
    expect(q.sql).toContain('AS `formula_1` FROM `t` GROUP BY 1 ORDER BY `formula_1` DESC');
  });
});

describe('show as and totals', () => {
  it('shows a measure as its share of the grand total, of its parent or of its column', () => {
    const dims = [{ field: 'channel' }, { field: 'team' }];
    const total = buildSelect(base({ dimensions: dims, measures: [{ field: 'x', agg: 'sum', showAs: 'percent_of_total' }] }), '`t`', 10);
    expect(total.sql).toContain('(SUM(`x`) / NULLIF(SUM(SUM(`x`)) OVER (), 0)) AS `sum_x`');
    const parent = buildSelect(base({ dimensions: dims, measures: [{ field: 'x', agg: 'sum', showAs: 'percent_of_parent' }] }), '`t`', 10);
    expect(parent.sql).toContain('(SUM(`x`) / NULLIF(SUM(SUM(`x`)) OVER (PARTITION BY `channel`), 0)) AS `sum_x`');
    const column = buildSelect(base({ dimensions: dims, measures: [{ field: 'x', agg: 'sum', showAs: 'percent_of_column' }] }), '`t`', 10);
    expect(column.sql).toContain('OVER (PARTITION BY `team`), 0)) AS `sum_x`');
    // with one dimension there is no parent: the share is of the grand total
    const one = buildSelect(base({ dimensions: [dims[0]!], measures: [{ field: 'x', agg: 'sum', showAs: 'percent_of_parent' }] }), '`t`', 10);
    expect(one.sql).toContain('OVER (), 0)) AS `sum_x`');
  });

  it('adds grand, row and column totals as extra columns and lifts them out of the rows', () => {
    const q = buildSelect(base({
      dimensions: [{ field: 'channel' }, { field: 'month', bucket: 'month' }],
      measures: [{ field: 'x', agg: 'sum' }, { field: 'x', agg: 'avg' }, { field: 'c', agg: 'count_distinct' }, { formula: '[sum_x] / [count_distinct_c]', alias: 'per' }],
      totals: true,
    }), '`t`', 10);
    expect(q.sql).toContain('SUM(SUM(`x`)) OVER () AS `__rs_t_sum_x`');
    expect(q.sql).toContain('(SUM(SUM(`x`)) OVER () / NULLIF(SUM(COUNT(`x`)) OVER (), 0)) AS `__rs_t_avg_x`');
    expect(q.sql).toContain('NULL AS `__rs_t_count_distinct_c`');
    expect(q.sql).toContain('(SUM(SUM(`x`)) OVER () / NULLIF(NULL, 0)) AS `__rs_t_per`');
    expect(q.sql).toContain("SUM(SUM(`x`)) OVER (PARTITION BY `channel`) AS `__rs_r_sum_x`");
    expect(q.sql).toContain("SUM(SUM(`x`)) OVER (PARTITION BY DATE_FORMAT(`month`, '%Y-%m')) AS `__rs_c_sum_x`");
    expect(q.columns.map((c) => c.alias)).toEqual(['channel', 'month_month', 'sum_x', 'avg_x', 'count_distinct_c', 'per']);
    expect(q.totals).toMatchObject({ rowDim: 'channel', colDim: 'month_month', grand: { sum_x: '__rs_t_sum_x' }, byRow: { sum_x: '__rs_r_sum_x' }, byColumn: { sum_x: '__rs_c_sum_x' } });

    const rows = [
      { channel: 'A', month_month: '2026-01', sum_x: 1, avg_x: 1, count_distinct_c: 1, per: 1, __rs_t_sum_x: 10, __rs_t_avg_x: 2.5, __rs_t_count_distinct_c: null, __rs_t_per: null, __rs_r_sum_x: 3, __rs_r_avg_x: 1.5, __rs_r_count_distinct_c: null, __rs_r_per: null, __rs_c_sum_x: 4, __rs_c_avg_x: 2, __rs_c_count_distinct_c: null, __rs_c_per: null },
      { channel: 'A', month_month: '2026-02', sum_x: 2, avg_x: 2, count_distinct_c: 1, per: 2, __rs_t_sum_x: 10, __rs_t_avg_x: 2.5, __rs_t_count_distinct_c: null, __rs_t_per: null, __rs_r_sum_x: 3, __rs_r_avg_x: 1.5, __rs_r_count_distinct_c: null, __rs_r_per: null, __rs_c_sum_x: 6, __rs_c_avg_x: 3, __rs_c_count_distinct_c: null, __rs_c_per: null },
    ];
    const out = extractTotals(rows, q.totals);
    expect(out.rows).toEqual([
      { channel: 'A', month_month: '2026-01', sum_x: 1, avg_x: 1, count_distinct_c: 1, per: 1 },
      { channel: 'A', month_month: '2026-02', sum_x: 2, avg_x: 2, count_distinct_c: 1, per: 2 },
    ]);
    expect(out.totals).toEqual({
      grand: { sum_x: 10, avg_x: 2.5, count_distinct_c: null, per: null },
      byRow: { A: { sum_x: 3, avg_x: 1.5, count_distinct_c: null, per: null } },
      byColumn: { '2026-01': { sum_x: 4, avg_x: 2, count_distinct_c: null, per: null }, '2026-02': { sum_x: 6, avg_x: 3, count_distinct_c: null, per: null } },
    });
  });

  it('totals a share within the dimensions the share and the total have in common', () => {
    const q = buildSelect(base({
      dimensions: [{ field: 'channel' }, { field: 'team' }],
      measures: [{ field: 'x', agg: 'sum', showAs: 'percent_of_parent', alias: 'p' }],
      totals: true,
    }), '`t`', 10);
    // grand total of "% of row": the whole against the whole
    expect(q.sql).toContain('(SUM(SUM(`x`)) OVER () / NULLIF(SUM(SUM(`x`)) OVER (), 0)) AS `__rs_t_p`');
    // row total of "% of row": 100 %
    expect(q.sql).toContain('(SUM(SUM(`x`)) OVER (PARTITION BY `channel`) / NULLIF(SUM(SUM(`x`)) OVER (PARTITION BY `channel`), 0)) AS `__rs_r_p`');
    // column total of "% of row": that column against everything
    expect(q.sql).toContain('(SUM(SUM(`x`)) OVER (PARTITION BY `team`) / NULLIF(SUM(SUM(`x`)) OVER (), 0)) AS `__rs_c_p`');
  });

  it('asks for no totals without dimensions or measures', () => {
    expect(buildSelect(base({ measures: [{ field: 'x', agg: 'sum' }], totals: true }), '`t`', 10).totals).toBeUndefined();
    expect(buildSelect(base({ dimensions: [{ field: 'r' }], totals: true }), '`t`', 10).totals).toBeUndefined();
    expect(extractTotals([{ a: 1 }], undefined)).toEqual({ rows: [{ a: 1 }] });
  });
});

describe('subtotals (hierarchical matrix)', () => {
  it('adds one windowed column per measure for every requested set of dimensions and lifts them out by value', () => {
    const q = buildSelect(base({
      dimensions: [{ field: 'channel' }, { field: 'team' }, { field: 'month', bucket: 'month' }],
      measures: [{ field: 'x', agg: 'sum' }, { formula: '[sum_x] / 2', alias: 'half' }],
      // the matrix: level 1 per column, level 1 across columns, columns alone, everything; a duplicate is ignored
      subtotals: [[0, 2], [0], [2], [], [2, 0]],
    }), '`t`', 10);
    expect(q.sql).toContain("SUM(SUM(`x`)) OVER (PARTITION BY `channel`, DATE_FORMAT(`month`, '%Y-%m')) AS `__rs_p0_sum_x`");
    expect(q.sql).toContain("(SUM(SUM(`x`)) OVER (PARTITION BY `channel`, DATE_FORMAT(`month`, '%Y-%m')) / NULLIF(?, 0)) AS `__rs_p0_half`");
    expect(q.sql).toContain('SUM(SUM(`x`)) OVER (PARTITION BY `channel`) AS `__rs_p1_sum_x`');
    expect(q.sql).toContain('SUM(SUM(`x`)) OVER () AS `__rs_p3_sum_x`');
    expect(q.sql).not.toContain('__rs_p4_');
    expect(q.columns.map((c) => c.alias)).toEqual(['channel', 'team', 'month_month', 'sum_x', 'half']);
    expect(q.subtotals?.partitions.map((p) => p.key)).toEqual(['0,2', '0', '2', '']);
    // the formula's constant is a parameter each time the formula is rendered: once per group, once per partition
    expect(q.params).toEqual([2, 2, 2, 2, 2]);

    const row = (channel: string, team: string, month: string, x: number, extra: Record<string, unknown>) => ({ channel, team, month_month: month, sum_x: x, half: x / 2, ...extra });
    const rows = [
      row('A', 't1', '2026-01', 1, { __rs_p0_sum_x: 3, __rs_p0_half: 1.5, __rs_p1_sum_x: 10, __rs_p1_half: 5, __rs_p2_sum_x: 4, __rs_p2_half: 2, __rs_p3_sum_x: 20, __rs_p3_half: 10 }),
      row('A', 't2', '2026-01', 2, { __rs_p0_sum_x: 3, __rs_p0_half: 1.5, __rs_p1_sum_x: 10, __rs_p1_half: 5, __rs_p2_sum_x: 4, __rs_p2_half: 2, __rs_p3_sum_x: 20, __rs_p3_half: 10 }),
      row('B', 't3', '2026-01', 1, { __rs_p0_sum_x: 1, __rs_p0_half: 0.5, __rs_p1_sum_x: 10, __rs_p1_half: 5, __rs_p2_sum_x: 4, __rs_p2_half: 2, __rs_p3_sum_x: 20, __rs_p3_half: 10 }),
    ];
    const out = extractSubtotals(rows, q.subtotals);
    expect(out.rows[0]).toEqual({ channel: 'A', team: 't1', month_month: '2026-01', sum_x: 1, half: 0.5 });
    expect(out.subtotals).toEqual({
      '0,2': { '["A","2026-01"]': { sum_x: 3, half: 1.5 }, '["B","2026-01"]': { sum_x: 1, half: 0.5 } },
      '0': { '["A"]': { sum_x: 10, half: 5 }, '["B"]': { sum_x: 10, half: 5 } },
      '2': { '["2026-01"]': { sum_x: 4, half: 2 } },
      '': { '[]': { sum_x: 20, half: 10 } },
    });
  });

  it('ignores subtotal dimensions the query does not have, and asks for none without measures', () => {
    const q = buildSelect(base({ dimensions: [{ field: 'a' }], measures: [{ field: 'x', agg: 'sum' }], subtotals: [[5], [0, 7]] }), '`t`', 10);
    expect(q.subtotals?.partitions.map((p) => p.key)).toEqual(['', '0']);
    expect(buildSelect(base({ dimensions: [{ field: 'a' }], subtotals: [[0]] }), '`t`', 10).subtotals).toBeUndefined();
    expect(extractSubtotals([{ a: 1 }], undefined)).toEqual({ rows: [{ a: 1 }] });
  });
});
