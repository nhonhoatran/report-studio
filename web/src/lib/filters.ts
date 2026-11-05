import type { CrossFilter, DashboardFilter, DateBucket, DatePreset, FieldInfo, Filter, FilterValue, QuerySource, Widget } from '@/api/types';
import { newId } from './id';

/*
 * Dashboard-level filters (Power BI's slicers): pure helpers shared by the bar that shows them,
 * the store that keeps their values and the widget that applies them to its query.
 */

/** The bucket choices a grain filter offers (no "raw" and no hour: it switches the reading of a trend). */
export const GRAIN_BUCKETS: DateBucket[] = ['year', 'quarter', 'month', 'week', 'day'];

export function newDashboardFilter(kind: DashboardFilter['kind'], datasourceId: number | null, source: QuerySource | null): DashboardFilter {
  return { id: newId('df'), kind, label: '', field: undefined, datasourceId, source, multi: kind === 'list', value: defaultFilterValue(kind) };
}

/** What a filter selects before anybody touched it: everything. */
export function defaultFilterValue(kind: DashboardFilter['kind']): FilterValue {
  if (kind === 'date_range') return { preset: 'all' };
  if (kind === 'grain') return { bucket: 'month' };
  return { values: [] };
}

/** A filter that narrows nothing is not shown as active. */
export function isFilterActive(filter: DashboardFilter, value: FilterValue | undefined): boolean {
  const v = value ?? filter.value ?? defaultFilterValue(filter.kind);
  if (filter.kind === 'date_range') return (v.preset ?? 'all') !== 'all' && (v.preset !== 'custom' || !!(v.from || v.to));
  if (filter.kind === 'grain') return (v.bucket ?? 'month') !== 'month';
  return (v.values?.length ?? 0) > 0;
}

/** Everything a filter needs before it can act: a column (or, for a grain, nothing). */
export function isFilterComplete(filter: DashboardFilter): boolean {
  if (filter.kind === 'grain') return true;
  return !!filter.field && !!filter.datasourceId && !!filter.source;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A preset as a closed interval of calendar days [from, to], in the browser's local calendar; null for "all". */
export function resolveDateRange(value: FilterValue | undefined, today = new Date()): { from?: string; to?: string } | null {
  const preset: DatePreset = value?.preset ?? 'all';
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case 'all': return null;
    case 'custom': return value?.from || value?.to ? { from: value.from || undefined, to: value.to || undefined } : null;
    case 'today': return { from: iso(start), to: iso(start) };
    case 'last_7_days': return { from: iso(addDays(start, -6)), to: iso(start) };
    case 'last_30_days': return { from: iso(addDays(start, -29)), to: iso(start) };
    case 'this_month': return { from: iso(new Date(start.getFullYear(), start.getMonth(), 1)), to: iso(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
    case 'last_month': return { from: iso(new Date(start.getFullYear(), start.getMonth() - 1, 1)), to: iso(new Date(start.getFullYear(), start.getMonth(), 0)) };
    case 'this_quarter': {
      const q = Math.floor(start.getMonth() / 3) * 3;
      return { from: iso(new Date(start.getFullYear(), q, 1)), to: iso(new Date(start.getFullYear(), q + 3, 0)) };
    }
    case 'this_year': return { from: iso(new Date(start.getFullYear(), 0, 1)), to: iso(new Date(start.getFullYear(), 11, 31)) };
  }
}

/** The day after `to`, so DATE and DATETIME columns both get the whole last day (`>= from AND < next`). */
function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return iso(addDays(new Date(y, m - 1, d), 1));
}

/** What the dashboard filters add to one widget's query. */
export interface AppliedFilters {
  filters: Filter[];
  /** a grain filter: the bucket every bucketed date dimension takes */
  bucket?: DateBucket;
  /** the date range filter in force on this widget: what a time comparison shifts */
  period?: { field: string; from?: string; to?: string };
}

const sameSource = (a: QuerySource | null | undefined, b: QuerySource | null | undefined) =>
  !!a && !!b && (a.type === 'table' && b.type === 'table' ? a.table === b.table : a.type === 'dataset' && b.type === 'dataset' ? a.datasetId === b.datasetId : false);

/** Does this filter concern the widget at all (same data source, and the widget's source must then be checked for the column)? */
export function filterConcerns(filter: DashboardFilter, widget: Widget): boolean {
  if (filter.kind === 'grain') return widget.query.dimensions.some((d) => d.kind === 'date' && d.bucket && d.bucket !== 'none');
  return isFilterComplete(filter) && !!widget.datasourceId && filter.datasourceId === widget.datasourceId;
}

/**
 * The filters to add to a widget's query. A field filter applies when the widget's source has the
 * column — the same source as the filter's, or any source whose field list (`sourceFields`) names it.
 * With no field list yet, only the filter's own source is trusted.
 */
export function applyDashboardFilters(widget: Widget, filters: DashboardFilter[], values: Record<string, FilterValue>, sourceFields: FieldInfo[] | undefined, today = new Date()): AppliedFilters {
  const out: AppliedFilters = { filters: [] };
  const hasColumn = (field: string) => (sourceFields ? sourceFields.some((f) => f.name === field) : false);
  for (const f of filters) {
    if (!filterConcerns(f, widget)) continue;
    const v = values[f.id] ?? f.value ?? defaultFilterValue(f.kind);
    if (f.kind === 'grain') {
      if (v.bucket) out.bucket = v.bucket;
      continue;
    }
    const field = f.field!;
    if (!(sameSource(f.source, widget.source) || hasColumn(field))) continue;
    if (f.kind === 'date_range') {
      const range = resolveDateRange(v, today);
      if (!out.period) out.period = { field, from: range?.from, to: range?.to };
      if (!range) continue;
      if (range.from) out.filters.push({ id: `${f.id}_from`, field, op: 'gte', value: range.from });
      if (range.to) out.filters.push({ id: `${f.id}_to`, field, op: 'lt', value: nextDay(range.to) });
    } else if (v.values && v.values.length) {
      out.filters.push({ id: f.id, field, op: 'in', values: v.values });
    }
  }
  return out;
}

/**
 * What the other filters of the report add when one list filter reads its choices: every field
 * filter on the same source (or whose column the source has), except the filter itself and the
 * grain. A filter marked independent reads its choices unnarrowed.
 */
export function filtersForChoices(filter: DashboardFilter, filters: DashboardFilter[], values: Record<string, FilterValue>, sourceFields: FieldInfo[] | undefined, today = new Date()): Filter[] {
  if (filter.independent || !filter.datasourceId || !filter.source) return [];
  const probe = { datasourceId: filter.datasourceId, source: filter.source, query: { dimensions: [] } } as unknown as Widget;
  return applyDashboardFilters(probe, filters.filter((f) => f.id !== filter.id && f.kind !== 'grain'), values, sourceFields, today).filters;
}

/** Is any filter on the dashboard going to need the widget's field list before it can decide? */
export function needsSourceFields(widget: Widget, filters: DashboardFilter[]): boolean {
  return filters.some((f) => f.kind !== 'grain' && filterConcerns(f, widget) && !sameSource(f.source, widget.source));
}

/** The clicks on other visuals that narrow this one: those naming a column of its source (the field list, else its own wells). */
export function applyCrossFilters(widget: Widget, cross: CrossFilter[], sourceFields: FieldInfo[] | undefined): Filter[] {
  if (widget.options.crossFilter === false) return [];
  const own = new Set([...widget.query.dimensions.map((d) => d.field), ...widget.query.measures.map((m) => m.field), ...widget.query.filters.map((f) => f.field)]);
  const has = (field: string) => (sourceFields ? sourceFields.some((f) => f.name === field) : own.has(field));
  return cross.filter((cf) => cf.widgetId !== widget.id && has(cf.field)).map((cf) => ({ id: `x_${cf.widgetId}`, field: cf.field, op: 'eq' as const, value: cf.value }));
}
