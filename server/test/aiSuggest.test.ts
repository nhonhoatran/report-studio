import { describe, expect, it } from 'vitest';
import { buildPrompt, parseSuggestions, sanitizeSuggestions, type SuggestField } from '../src/ai/suggest.js';
import { HttpError } from '../src/lib/errors.js';

const fields: SuggestField[] = [
  { name: 'order_date', kind: 'date', dataType: 'date' },
  { name: 'region', kind: 'string', dataType: 'varchar(50)' },
  { name: 'revenue', kind: 'number', dataType: 'decimal(12,2)' },
  { name: 'status', kind: 'string', dataType: 'varchar(20)' },
];

describe('buildPrompt', () => {
  it('lists every field with its kind and asks in the chosen language', () => {
    const { system, user } = buildPrompt({ sourceLabel: 'v_sales', fields, prompt: 'doanh thu theo tháng', lang: 'vi', count: 3 });
    expect(user).toContain('- revenue (number, decimal(12,2))');
    expect(user).toContain('doanh thu theo tháng');
    expect(user).toContain('exactly 3 suggestions');
    expect(system).toContain('Vietnamese');
    expect(system).toContain('never write SQL');
  });
  it('falls back to a generic request and clamps the count', () => {
    const { user } = buildPrompt({ sourceLabel: 'v_sales', fields, count: 99 });
    expect(user).toContain('most useful visuals');
    expect(user).toContain('exactly 8 suggestions');
  });
});

describe('parseSuggestions', () => {
  it('reads a plain object, a fenced block and a bare array', () => {
    const one = [{ type: 'kpi', title: 'Revenue', dimensions: [], measures: [{ field: 'revenue', agg: 'sum' }] }];
    expect(parseSuggestions(JSON.stringify({ suggestions: one }))).toHaveLength(1);
    expect(parseSuggestions('Here you go:\n```json\n' + JSON.stringify({ suggestions: one }) + '\n```')).toHaveLength(1);
    expect(parseSuggestions(JSON.stringify(one))).toHaveLength(1);
  });
  it('rejects prose and invalid JSON with a coded error', () => {
    for (const text of ['I cannot help with that.', '{"suggestions": [oops]}', '{"foo": 1}']) {
      let caught: unknown;
      try { parseSuggestions(text); } catch (err) { caught = err; }
      expect(caught).toBeInstanceOf(HttpError);
      expect((caught as HttpError).code).toBe('ai_bad_response');
    }
  });
});

describe('sanitizeSuggestions', () => {
  it('drops unknown fields, fixes aggregations and buckets', () => {
    const out = sanitizeSuggestions([{
      type: 'line', title: 'Doanh thu theo tháng', explanation: 'x',
      dimensions: [{ field: 'order_date' }, { field: 'ghost_column' }],
      measures: [{ field: 'revenue', agg: 'sum' }, { field: 'region', agg: 'avg' }, { field: 'nope', agg: 'sum' }],
    }], fields);
    expect(out).toHaveLength(1);
    expect(out[0]!.dimensions).toEqual([{ field: 'order_date', kind: 'date', bucket: 'month' }]);
    expect(out[0]!.measures).toEqual([
      { field: 'revenue', kind: 'number', agg: 'sum' },
      { field: 'region', kind: 'string', agg: 'count' },
    ]);
    expect(out[0]!.sortBy).toBe('none');
  });
  it('trims wells to what the chart type reads and keeps row counts', () => {
    const out = sanitizeSuggestions([
      { type: 'kpi', title: 'Orders', dimensions: [{ field: 'region' }], measures: [{ field: '*', agg: 'count' }, { field: 'revenue', agg: 'sum' }] },
      { type: 'pie', title: 'By region', dimensions: [{ field: 'region' }, { field: 'status' }], measures: [{ field: 'revenue', agg: 'sum' }] },
    ], fields);
    expect(out[0]!.dimensions).toHaveLength(0);
    expect(out[0]!.measures).toEqual([{ field: '*', kind: 'number', agg: 'count' }]);
    expect(out[1]!.dimensions).toHaveLength(1);
  });
  it('skips visuals that could not run, de-duplicates and caps the list', () => {
    const dup = { type: 'column', title: 'A', dimensions: [{ field: 'region' }], measures: [{ field: 'revenue', agg: 'sum' }] };
    const raw = [
      { type: 'bar', title: 'No measure', dimensions: [{ field: 'region' }], measures: [] },
      { type: 'pie', title: 'No dim', dimensions: [], measures: [{ field: 'revenue', agg: 'sum' }] },
      { type: 'table', title: 'Rows', dimensions: [{ field: 'region' }, { field: 'status' }], measures: [] },
      dup, { ...dup, title: 'B' },
      ...Array.from({ length: 10 }, (_, i) => ({ type: 'kpi', title: `k${i}`, dimensions: [], measures: [{ field: 'revenue', agg: (['sum', 'avg', 'min', 'max', 'count', 'count_distinct'] as const)[i % 6] }] })),
    ];
    const out = sanitizeSuggestions(raw, fields);
    expect(out.map((s) => s.title)).toContain('Rows');
    expect(out.filter((s) => s.title === 'A' || s.title === 'B')).toHaveLength(1);
    expect(out.find((s) => s.title === 'No measure')).toBeUndefined();
    expect(out.find((s) => s.title === 'No dim')).toBeUndefined();
    expect(out.length).toBeLessThanOrEqual(8);
  });
  it('invents a title when the model left it blank and keeps only known filters', () => {
    const out = sanitizeSuggestions([{
      type: 'column', dimensions: [{ field: 'region' }], measures: [{ field: 'revenue', agg: 'sum' }],
      filters: [{ field: 'status', op: 'in', values: ['paid'] }, { field: 'ghost', op: 'eq', value: 1 }, { field: 'status', op: 'like' }],
    }], fields);
    expect(out[0]!.title).toBe('sum revenue · region');
    expect(out[0]!.filters).toEqual([{ field: 'status', op: 'in', values: ['paid'] }]);
  });
});
