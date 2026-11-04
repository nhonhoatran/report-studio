import type { Aggregation, QueryResult, QueryResultColumn, Widget } from '@/api/types';
import { translate, type Lang } from '@/i18n';
import { dimensionAlias, measureAlias } from '@/lib/widget';

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

/** "Tổng revenue" for a measure column, read from the widget's own wells; undefined for anything else. */
export function measureLabel(widget: Widget, alias: string, lang: Lang): string | undefined {
  const m = widget.query.measures.find((mm) => measureAlias(mm) === alias);
  if (!m) return undefined;
  return `${translate(lang, `agg.${m.agg}`)} ${m.field === '*' ? '' : m.field}`.trim();
}

/** The aggregation behind a measure column, so totals know what they may add up. */
export function measureAgg(widget: Widget, alias: string): Aggregation | undefined {
  return widget.query.measures.find((m) => measureAlias(m) === alias)?.agg;
}

/** A column header a reader understands: the field (with its date bucket) or the measure label, never the SQL alias. */
export function columnLabel(widget: Widget, c: QueryResultColumn, lang: Lang): string {
  if (c.role === 'measure') return measureLabel(widget, c.alias, lang) ?? c.alias;
  if (c.role === 'dimension') {
    const d = widget.query.dimensions.find((dd) => dimensionAlias(dd) === c.alias);
    if (!d) return c.alias;
    return d.bucket && d.bucket !== 'none' ? `${d.field} (${translate(lang, `bucket.${d.bucket}`)})` : d.field;
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

export interface Pivot {
  rowKeys: string[];
  colKeys: string[];
  /** the measure values of the cell at (row, col) */
  cell: (row: string, col: string) => Row | undefined;
}

/** Matrix: rows by dim 0, columns by dim 1 (a single empty column when there is none). */
export function pivot(result: QueryResult): Pivot {
  const [rowDim, colDim] = dimensionAliases(result);
  const rowKeys = rowDim ? uniq(result.rows.map((r) => str(r[rowDim]))) : [''];
  const colKeys = colDim ? uniq(result.rows.map((r) => str(r[colDim]))) : [''];
  const cells = new Map<string, Row>();
  for (const r of result.rows) {
    const k = `${rowDim ? str(r[rowDim]) : ''}\u0000${colDim ? str(r[colDim]) : ''}`;
    if (!cells.has(k)) cells.set(k, r);
  }
  return { rowKeys, colKeys, cell: (row, col) => cells.get(`${row}\u0000${col}`) };
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
