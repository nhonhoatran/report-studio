import type { Dimension, FieldInfo, Measure, QueryRequest, Widget, WidgetType } from '@/api/types';
import { newId } from './id';

export const CARTESIAN: WidgetType[] = ['column', 'bar', 'line', 'area'];
export const RADIAL: WidgetType[] = ['pie', 'donut'];

export function newWidget(partial: Partial<Widget> = {}): Widget {
  return {
    id: newId('w'),
    type: 'column',
    title: '',
    layout: { x: 0, y: 0, w: 6, h: 7 },
    datasourceId: null,
    source: null,
    query: { dimensions: [], measures: [], filters: [], orderBy: [] },
    options: { legend: true, numberFormat: 'auto' },
    ...partial,
  };
}

/** How many dimension slots a chart type reads. */
export function maxDimensions(type: WidgetType): number {
  if (type === 'kpi') return 0;
  if (type === 'table') return 10;
  if (RADIAL.includes(type)) return 1;
  return 2; // axis + legend
}

export function maxMeasures(type: WidgetType): number {
  if (type === 'kpi') return 1;
  if (RADIAL.includes(type)) return 1;
  return 20;
}

export function defaultDimension(f: FieldInfo): Dimension {
  return { field: f.name, kind: f.kind, bucket: f.kind === 'date' ? 'month' : undefined };
}

export function defaultMeasure(f: FieldInfo): Measure {
  return { field: f.name, kind: f.kind, agg: f.kind === 'number' ? 'sum' : 'count' };
}

/** Add a field the Power BI way: numbers become measures, everything else a dimension. */
export function autoPlace(widget: Widget, f: FieldInfo): Widget {
  const q = widget.query;
  const asMeasure = f.kind === 'number' || q.dimensions.length >= maxDimensions(widget.type);
  if (asMeasure) {
    if (q.measures.length >= maxMeasures(widget.type)) return widget;
    if (q.measures.some((m) => m.field === f.name)) return widget;
    return { ...widget, query: { ...q, measures: [...q.measures, defaultMeasure(f)] } };
  }
  if (q.dimensions.some((d) => d.field === f.name)) return widget;
  return { ...widget, query: { ...q, dimensions: [...q.dimensions, defaultDimension(f)] } };
}

/** Changing chart type may need to trim wells that the new type does not read. */
export function coerceForType(widget: Widget, type: WidgetType): Widget {
  const q = widget.query;
  return {
    ...widget,
    type,
    query: {
      ...q,
      dimensions: q.dimensions.slice(0, maxDimensions(type)),
      measures: q.measures.slice(0, maxMeasures(type)),
    },
  };
}

export function isRunnable(widget: Widget): boolean {
  return !!widget.datasourceId && !!widget.source && (widget.query.dimensions.length + widget.query.measures.length > 0);
}

export function toQueryRequest(widget: Widget): QueryRequest | null {
  if (!widget.datasourceId || !widget.source) return null;
  const q = widget.query;
  const orderBy = [...q.orderBy];
  if (orderBy.length === 0 && q.measures.length && widget.options.sortBy && widget.options.sortBy !== 'none') {
    const m = q.measures[0]!;
    orderBy.push({ alias: measureAlias(m), direction: widget.options.sortBy === 'measure_desc' ? 'desc' : 'asc' });
  }
  return {
    datasourceId: widget.datasourceId,
    source: widget.source,
    dimensions: q.dimensions.map(({ field, bucket, alias }) => ({ field, bucket: bucket ?? 'none', alias })),
    measures: q.measures.map(({ field, agg, alias }) => ({ field, agg, alias })),
    filters: q.filters.filter((f) => f.field).map(({ field, op, value, values }) => ({ field, op, value, values })),
    orderBy,
    limit: q.limit ?? (widget.type === 'table' ? 500 : 1000),
  };
}

const safe = (s: string) => (s.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60) || 'col');
export function dimensionAlias(d: Dimension): string {
  if (d.alias) return safe(d.alias);
  return safe(d.bucket && d.bucket !== 'none' ? `${d.field}_${d.bucket}` : d.field);
}
export function measureAlias(m: Measure): string {
  if (m.alias) return safe(m.alias);
  return safe(`${m.agg}_${m.field === '*' ? 'all' : m.field}`);
}

/** A stable cache key for react-query. */
export function widgetQueryKey(widget: Widget): unknown[] {
  return ['widget-query', toQueryRequest(widget)];
}

/** Title shown when the author left it blank: "Sum revenue by region". */
export function autoTitle(widget: Widget, t: (k: 'editor.by' | 'editor.widgetDefaultTitle' | `agg.${Measure['agg']}`) => string): string {
  if (widget.title) return widget.title;
  const m = widget.query.measures[0];
  const d = widget.query.dimensions[0];
  if (!m && !d) return t('editor.widgetDefaultTitle');
  const head = m ? `${t(`agg.${m.agg}`)} ${m.field === '*' ? '' : m.field}`.trim() : d!.field;
  return m && d ? `${head} ${t('editor.by')} ${d.field}` : head;
}
