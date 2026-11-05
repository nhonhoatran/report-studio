import type { Aggregation, Measure, NumberFormat, QueryResult, QueryResultColumn, Widget } from '@/api/types';
import { isFormula } from '@/api/types';
import { translate, type Lang } from '@/i18n';
import { dimensionAlias, dimensionName, measureAlias, measureFormat, measureName } from '@/lib/widget';

/*
 * Pure helpers that turn a query result (columns with roles, flat rows) into what a visual
 * draws: categories and series for an axis, a pivot for a matrix, labels a reader understands.
 * Nothing here touches the DOM, so every visual shapes its data the same way.
 */

export type Row = Record<string, unknown>;

/** A cell as a number, or null for empty / non-numeric (MariaDB returns DECIMAL as a string). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const uniq = (values: string[]): string[] => Array.from(new Set(values));

/** A comparison column the server derived from a measure: `<alias>_prev` (the earlier period) or `<alias>_change` (its share of change). */
export function derivedOf(widget: Widget, alias: string): { base: Measure; kind: 'prev' | 'change' } | undefined {
  const m = /^(.*)_(prev|change)$/.exec(alias);
  if (!m) return undefined;
  const base = widget.query.measures.find((mm) => measureAlias(mm) === m[1]);
  return base ? { base, kind: m[2] as 'prev' | 'change' } : undefined;
}

/** The measure behind a result column, from the widget's own wells (a derived comparison column answers with its base measure). */
export const measureOf = (widget: Widget, alias: string): Measure | undefined => widget.query.measures.find((mm) => measureAlias(mm) === alias) ?? derivedOf(widget, alias)?.base;

/**
 * The name a reader sees for a measure column: the author's display name, else "Tổng revenue"
 * (with the share it is shown as, "… (% of total)"); undefined for a column that is no measure.
 */
export function measureLabel(widget: Widget, alias: string, lang: Lang): string | undefined {
  const derived = derivedOf(widget, alias);
  const m = derived?.base ?? measureOf(widget, alias);
  if (!m) return undefined;
  let name = measureName(m, (k) => translate(lang, k));
  if (!m.label?.trim() && m.showAs && m.showAs !== 'value') name = `${name} (${translate(lang, `editor.showAsShort.${m.showAs}`)})`;
  if (derived) name = `${name} (${translate(lang, derived.kind === 'change' ? 'editor.compareChange' : m.compare === 'same_period_last_year' ? 'editor.compareLastYearShort' : 'editor.comparePreviousShort')})`;
  return name;
}

/** The number format a measure column is shown in (see `measureFormat`); a change against an earlier period is a percent. */
export const columnFormat = (widget: Widget, alias: string): NumberFormat => (derivedOf(widget, alias)?.kind === 'change' ? 'percent' : measureFormat(measureOf(widget, alias), widget.options.numberFormat));

/** The "others" row Top N gathers the rest into: its first dimension reads as the translated word instead of nothing. */
export function labelOthers(result: QueryResult, label: string): QueryResult {
  if (!result.rows.some((r) => r.__rs_others)) return result;
  const first = result.columns.find((c) => c.role === 'dimension')?.alias;
  if (!first) return result;
  return { ...result, rows: result.rows.map((r) => (r.__rs_others ? { ...r, [first]: label } : r)) };
}

/** The aggregation behind a measure column, so client-side totals know what they may add up; a formula has none. */
export function measureAgg(widget: Widget, alias: string): Aggregation | undefined {
  const m = measureOf(widget, alias);
  return m && !isFormula(m) ? m.agg : undefined;
}

/** A column header a reader understands: the field's display name (with its date bucket) or the measure label, never the SQL alias. */
export function columnLabel(widget: Widget, c: QueryResultColumn, lang: Lang): string {
  if (c.role === 'measure') return measureLabel(widget, c.alias, lang) ?? c.alias;
  if (c.role === 'dimension') {
    const d = widget.query.dimensions.find((dd) => dimensionAlias(dd) === c.alias);
    if (!d) return c.alias;
    if (d.label?.trim()) return d.label.trim();
    return d.bucket && d.bucket !== 'none' ? `${dimensionName(d)} (${translate(lang, `bucket.${d.bucket}`)})` : dimensionName(d);
  }
  return c.alias;
}

export const dimensionAliases = (result: QueryResult) => result.columns.filter((c) => c.role === 'dimension').map((c) => c.alias);
export const measureAliases = (result: QueryResult) => result.columns.filter((c) => c.role === 'measure').map((c) => c.alias);

export interface Series { name: string; data: (number | null)[]; /** the measure column the values come from */ alias: string }
export interface Shaped {
  categories: string[];
  series: Series[];
  axis?: string;
  legend?: string;
  dims: string[];
  measures: string[];
}

/**
 * rows -> { categories, series[] } honouring axis (dim 0) and legend (dim 1).
 * With a legend, the first measure is split into one series per legend value; otherwise each
 * measure is a series. Categories keep the order the server returned them in.
 */
export function shape(result: QueryResult, widget: Widget, lang: Lang): Shaped {
  const dims = dimensionAliases(result);
  const measures = measureAliases(result);
  const axis = dims[0];
  const legend = dims[1];
  const rows = result.rows;
  const categories = axis ? uniq(rows.map((r) => str(r[axis]))) : [''];
  const labelOf = (alias: string) => measureLabel(widget, alias, lang) ?? alias;
  const key = (a: string, b: string) => `${a}\u0000${b}`;
  const series: Series[] = [];
  if (legend && measures[0]) {
    const m = measures[0];
    const legendValues = uniq(rows.map((r) => str(r[legend])));
    const index = new Map<string, number | null>();
    for (const r of rows) index.set(key(str(r[axis!]), str(r[legend])), num(r[m]));
    for (const lv of legendValues) {
      series.push({ name: lv, alias: m, data: categories.map((cat) => index.get(key(cat, lv)) ?? null) });
    }
  } else {
    const firstRow = new Map<string, Row>();
    for (const r of rows) {
      const cat = axis ? str(r[axis]) : '';
      if (!firstRow.has(cat)) firstRow.set(cat, r);
    }
    for (const m of measures) {
      series.push({ name: labelOf(m), alias: m, data: categories.map((cat) => num(firstRow.get(cat)?.[m])) });
    }
  }
  return { categories, series, axis, legend, dims, measures };
}

/** 100 % stacking: each value as its share of the category total. */
export function toShares(series: Series[]): Series[] {
  const totals = series[0]?.data.map((_, i) => series.reduce((sum, s) => sum + Math.abs(s.data[i] ?? 0), 0)) ?? [];
  return series.map((s) => ({ ...s, data: s.data.map((v, i) => (v === null || !totals[i] ? null : Math.abs(v) / totals[i]!)) }));
}

/** Only additive aggregations can be totalled on the client; averages, minima and maxima cannot. */
export const canTotal = (agg: Aggregation | undefined) => agg === 'sum' || agg === 'count';

export function sum(values: (number | null)[]): number | null {
  let total: number | null = null;
  for (const v of values) if (v !== null) total = (total ?? 0) + v;
  return total;
}

/** The first of `steps` × 10^k at or above `n` (1, 2, 5 by default): a gauge's upper bound when nobody set one. */
export function niceCeil(n: number, steps: number[] = [1, 2, 5, 10]): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = 10 ** exp;
  for (const step of steps) if (step * base >= n) return step * base;
  return 10 * base;
}
