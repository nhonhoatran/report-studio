import type { Compare, DateBucket, DateShift, Filter, Measure, QueryRequest, QueryResult } from './types.js';

/*
 * Time comparisons: a measure with `compare` is also shown for the previous period or the same
 * period a year earlier. The server runs the visual's query a second time with the period's
 * date filters moved back and its date dimension moved forward by the same amount (so the
 * earlier rows land on the current keys), then joins the two by dimension values into
 * `<alias>_prev` and `<alias>_change` columns. A period with nothing earlier stays empty.
 */

/** The ISO day `n` units earlier (`n` negative moves later); calendar months keep the day where they can. */
export function shiftDay(day: string, shift: DateShift): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  switch (shift.unit) {
    case 'DAY': d.setUTCDate(d.getUTCDate() - shift.n); break;
    case 'WEEK': d.setUTCDate(d.getUTCDate() - 7 * shift.n); break;
    case 'MONTH': d.setUTCMonth(d.getUTCMonth() - shift.n); break;
    case 'QUARTER': d.setUTCMonth(d.getUTCMonth() - 3 * shift.n); break;
    case 'YEAR': d.setUTCFullYear(d.getUTCFullYear() - shift.n); break;
    case 'HOUR': d.setUTCHours(d.getUTCHours() - shift.n); break;
  }
  const rest = day.slice(m[0].length);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}${rest}`;
}

const BUCKET_UNIT: Record<DateBucket, DateShift['unit']> = { none: 'MONTH', year: 'YEAR', quarter: 'QUARTER', month: 'MONTH', week: 'WEEK', day: 'DAY', hour: 'HOUR' };

/** How far back a comparison looks: a year, or one period (the filter's range in days, else one bucket of the grain). */
export function shiftFor(compare: Compare, period: QueryRequest['period']): DateShift {
  if (compare === 'same_period_last_year') return { n: 1, unit: 'YEAR' };
  if (period?.from && period.to) {
    const from = Date.parse(`${period.from.slice(0, 10)}T00:00:00Z`); const to = Date.parse(`${period.to.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) return { n: Math.round((to - from) / 86_400_000) + 1, unit: 'DAY' };
  }
  return { n: 1, unit: BUCKET_UNIT[period?.bucket ?? 'month'] };
}

/** The request that reads the earlier period: its date filters moved back, its date dimension moved forward. */
export function shiftedRequest(req: QueryRequest, shift: DateShift): QueryRequest {
  const field = req.period!.field;
  type Scalar = string | number | boolean | null;
  const back = (v: Scalar): Scalar => (typeof v === 'string' ? shiftDay(v, shift) : v);
  const filters: Filter[] = req.filters.map((f) => (f.field !== field ? f : { ...f, value: f.value === undefined ? undefined : back(f.value), values: f.values?.map(back) }));
  const forward: DateShift = { n: shift.n, unit: shift.unit };
  return {
    ...req,
    filters,
    dimensions: req.dimensions.map((d) => (d.field === field ? { ...d, shift: forward } : d)),
    measures: req.measures.map((m) => ({ ...m, compare: undefined, cumulative: m.cumulative })),
    topN: undefined, totals: undefined, subtotals: undefined,
  };
}

export const measuresToCompare = (measures: Measure[]): boolean => measures.some((m) => !!m.compare);

/** Joins the earlier period onto the current rows by dimension values: `<alias>_prev` and `<alias>_change` (a share of the earlier value). */
export function mergePrevious(current: QueryResult, previous: QueryResult, measures: Measure[]): QueryResult {
  const dims = current.columns.filter((c) => c.role === 'dimension').map((c) => c.alias);
  const measureCols = current.columns.filter((c) => c.role === 'measure');
  const compared = measureCols.filter((c, i) => !!measures[i]?.compare);
  if (!compared.length) return current;
  const keyOf = (r: Record<string, unknown>) => JSON.stringify(dims.map((d) => (r[d] === null || r[d] === undefined ? null : String(r[d]))));
  const earlier = new Map(previous.rows.map((r) => [keyOf(r), r]));
  const num = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const rows = current.rows.map((r) => {
    const p = earlier.get(keyOf(r));
    const out: Record<string, unknown> = { ...r };
    for (const c of compared) {
      const prev = p ? num(p[c.alias]) : null;
      const cur = num(r[c.alias]);
      out[`${c.alias}_prev`] = prev;
      out[`${c.alias}_change`] = prev === null || prev === 0 || cur === null ? null : (cur - prev) / Math.abs(prev);
    }
    return out;
  });
  const columns = [...current.columns];
  for (const c of compared) columns.push({ alias: `${c.alias}_prev`, role: 'measure' }, { alias: `${c.alias}_change`, role: 'measure' });
  return { ...current, rows, columns };
}
