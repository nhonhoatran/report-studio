import { describe, expect, it } from 'vitest';
import { checkFormula, formulaRefs, parseFormula, resolveRef, type MeasureRef } from '../src/shared/formula.js';

const ok = (src: string) => {
  const r = parseFormula(src);
  if (!r.ok) throw new Error(`expected ${src} to parse, got ${r.error.code} at ${r.error.position}`);
  return r.ast;
};
const bad = (src: string) => {
  const r = parseFormula(src);
  if (r.ok) throw new Error(`expected ${src} to fail`);
  return r.error;
};

describe('parseFormula', () => {
  it('parses references, aggregations, constants and precedence', () => {
    const ast = ok('[Lãi gộp] / sum(doanh_so) * 100 + -2.5');
    expect(ast).toEqual({
      type: 'binary', op: '+',
      left: {
        type: 'binary', op: '*',
        left: { type: 'binary', op: '/', left: { type: 'ref', name: 'Lãi gộp', start: 0, end: 9 }, right: { type: 'agg', agg: 'sum', field: 'doanh_so', start: 12, end: 25 } },
        right: { type: 'number', value: 100 },
      },
      right: { type: 'neg', arg: { type: 'number', value: 2.5 } },
    });
  });
  it('accepts parentheses, bare identifiers, count(*), × and ÷', () => {
    expect(ok('(a - b) × 2 ÷ count(*)')).toMatchObject({ type: 'binary', op: '/' });
    expect(formulaRefs(ok('(a - b) / c')).map((r) => r.name)).toEqual(['a', 'b', 'c']);
    expect(ok('COUNT_DISTINCT(customer)')).toMatchObject({ type: 'agg', agg: 'count_distinct', field: 'customer' });
    expect(ok('1e3 + .5')).toMatchObject({ type: 'binary', op: '+' });
  });
  it('names the position of each mistake', () => {
    expect(bad('')).toEqual({ code: 'empty', position: 0 });
    expect(bad('   ')).toEqual({ code: 'empty', position: 0 });
    expect(bad('a + ')).toMatchObject({ code: 'unexpected_end', position: 4 });
    expect(bad('a + * b')).toMatchObject({ code: 'unexpected_token', position: 4, token: '*' });
    expect(bad('(a + b')).toMatchObject({ code: 'unclosed_paren', position: 6 });
    expect(bad('a + b)')).toMatchObject({ code: 'unexpected_token', position: 5, token: ')' });
    expect(bad('[doanh so')).toMatchObject({ code: 'unclosed_bracket', position: 0 });
    expect(bad('a # b')).toMatchObject({ code: 'unexpected_char', position: 2, token: '#' });
    expect(bad('median(x)')).toMatchObject({ code: 'unknown_function', position: 0, token: 'median' });
    expect(bad('sum(*)')).toMatchObject({ code: 'bad_argument', position: 4 });
    expect(bad('sum()')).toMatchObject({ code: 'bad_argument', position: 4 });
    expect(bad('1.2.3')).toMatchObject({ code: 'bad_number', position: 0 });
    expect(bad('[]')).toMatchObject({ code: 'unexpected_token', position: 0 });
    expect(bad('x'.repeat(3000))).toMatchObject({ code: 'too_long' });
    expect(bad('('.repeat(60) + '1' + ')'.repeat(60))).toMatchObject({ code: 'too_deep' });
  });
});

describe('checkFormula', () => {
  const measures: MeasureRef[] = [
    { alias: 'sum_a', label: 'Doanh số' },
    { alias: 'sum_b' },
    { alias: 'calc_1', label: 'Tỷ lệ', formula: '[sum_a] / [Doanh số]' },
    { alias: 'calc_2', formula: '[calc_3] + 1' },
    { alias: 'calc_3', formula: '[calc_2] * 2' },
  ];
  it('resolves by alias or display name, case-insensitively', () => {
    expect(resolveRef('SUM_A', measures)?.alias).toBe('sum_a');
    expect(resolveRef(' doanh số ', measures)?.alias).toBe('sum_a');
    expect(resolveRef('nope', measures)).toBeUndefined();
  });
  it('accepts a formula over other measures and reports unknown names where they stand', () => {
    expect(checkFormula(measures[2]!, measures).ok).toBe(true);
    const r = checkFormula({ alias: 'x', formula: 'sum_a / [Chi phí]' }, measures);
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown_ref', position: 8, token: 'Chi phí' } });
  });
  it('rejects a formula that refers to itself, directly or through another formula', () => {
    expect(checkFormula({ alias: 'me', formula: '[me] + 1' }, [...measures, { alias: 'me', formula: '[me] + 1' }])).toMatchObject({ ok: false, error: { code: 'self_ref', position: 0 } });
    expect(checkFormula(measures[3]!, measures)).toMatchObject({ ok: false, error: { code: 'cycle', position: 0, token: 'calc_3' } });
  });
});
