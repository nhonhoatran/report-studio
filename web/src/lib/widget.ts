import type { DateBucket, Dimension, FieldInfo, Filter, Measure, QueryRequest, Stacking, Widget, WidgetType } from '@/api/types';
import type { TKey } from '@/i18n';
import { newId } from './id';

/** Which options the visual pane offers for a type. */
export type ChartFeature =
  | 'legend'        // show / hide + position
  | 'stacking'      // none / stacked / 100%
  | 'showValues'    // data labels
  | 'sort'          // order by the first measure
  | 'analytics'     // reference line, average line
  | 'totals'        // totals row / column
  | 'dataBars'      // bars behind numeric cells
  | 'gauge'         // min / max, show the target
  | 'target'        // a target number when no second measure carries it
  | 'series';       // each measure drawn as a column or a line (combo)

export interface ChartSpec {
  /** gallery grouping (Power BI order): compare, trend, part-to-whole, relation, single value, tables */
  group: 'compare' | 'part' | 'relation' | 'single' | 'table';
  minDimensions: number; maxDimensions: number;
  minMeasures: number; maxMeasures: number;
  /** labels of the two wells */
  wells: { dimensions: TKey; measures: TKey };
  /** a label per slot where the slots mean different things (X / Y / Size, Rows / Columns, Value / Target) */
  dimensionSlots?: TKey[]; measureSlots?: TKey[];
  features: ChartFeature[];
  /** default row limit sent with the query */
  limit: number;
}

const AXIS_LEGEND: ChartSpec['wells'] = { dimensions: 'editor.wellAxisLegend', measures: 'editor.wellValues' };
const CATEGORY_VALUES: ChartSpec['wells'] = { dimensions: 'editor.wellCategory', measures: 'editor.wellValues' };
const AXIS_SLOTS: TKey[] = ['editor.slotAxis', 'editor.slotLegend'];
const CARTESIAN_FEATURES: ChartFeature[] = ['legend', 'stacking', 'showValues', 'sort', 'analytics'];

const cartesian: ChartSpec = {
  group: 'compare', minDimensions: 0, maxDimensions: 2, minMeasures: 1, maxMeasures: 20,
  wells: AXIS_LEGEND, dimensionSlots: AXIS_SLOTS, features: CARTESIAN_FEATURES, limit: 1000,
};
const radial: ChartSpec = {
  group: 'part', minDimensions: 1, maxDimensions: 1, minMeasures: 1, maxMeasures: 1,
  wells: CATEGORY_VALUES, features: ['legend', 'showValues', 'sort'], limit: 1000,
};

/** One row per visual type: how many fields each well takes, what each slot means, which options apply. */
export const CHART_SPECS: Record<WidgetType, ChartSpec> = {
  column: cartesian,
  bar: cartesian,
  line: { ...cartesian, features: ['legend', 'showValues', 'sort', 'analytics'] },
  area: cartesian,
  combo: {
    group: 'compare', minDimensions: 0, maxDimensions: 1, minMeasures: 1, maxMeasures: 20,
    wells: { dimensions: 'editor.wellAxis', measures: 'editor.wellComboValues' },
    features: ['legend', 'showValues', 'sort', 'analytics', 'series'], limit: 1000,
  },
  scatter: {
    group: 'relation', minDimensions: 1, maxDimensions: 2, minMeasures: 2, maxMeasures: 3,
    wells: { dimensions: 'editor.wellDetailLegend', measures: 'editor.wellScatterValues' },
    dimensionSlots: ['editor.slotDetail', 'editor.slotLegend'], measureSlots: ['editor.slotX', 'editor.slotY', 'editor.slotSize'],
    features: ['legend', 'showValues'], limit: 2000,
  },
  waterfall: {
    group: 'compare', minDimensions: 1, maxDimensions: 1, minMeasures: 1, maxMeasures: 1,
    wells: CATEGORY_VALUES, features: ['legend', 'showValues', 'sort'], limit: 1000,
  },
  funnel: {
    group: 'part', minDimensions: 1, maxDimensions: 1, minMeasures: 1, maxMeasures: 1,
    wells: { dimensions: 'editor.wellStage', measures: 'editor.wellValues' }, features: ['legend', 'showValues'], limit: 1000,
  },
  pie: radial,
  donut: radial,
  treemap: {
    group: 'part', minDimensions: 1, maxDimensions: 2, minMeasures: 1, maxMeasures: 1,
    wells: { dimensions: 'editor.wellGroupDetail', measures: 'editor.wellValues' },
    dimensionSlots: ['editor.slotGroup', 'editor.slotDetail'], features: ['showValues', 'sort'], limit: 1000,
  },
  heatmap: {
    group: 'relation', minDimensions: 2, maxDimensions: 2, minMeasures: 1, maxMeasures: 1,
    wells: { dimensions: 'editor.wellXY', measures: 'editor.wellValues' },
    dimensionSlots: ['editor.slotX', 'editor.slotY'], features: ['legend', 'showValues'], limit: 5000,
  },
  radar: {
    group: 'relation', minDimensions: 1, maxDimensions: 2, minMeasures: 1, maxMeasures: 20,
    wells: AXIS_LEGEND, dimensionSlots: AXIS_SLOTS, features: ['legend', 'showValues'], limit: 1000,
  },
  gauge: {
    group: 'single', minDimensions: 0, maxDimensions: 0, minMeasures: 1, maxMeasures: 2,
    wells: { dimensions: 'editor.wellCategory', measures: 'editor.wellValueTarget' },
    measureSlots: ['editor.slotValue', 'editor.slotTarget'], features: ['gauge', 'target'], limit: 1,
  },
  kpi: {
    group: 'single', minDimensions: 0, maxDimensions: 0, minMeasures: 1, maxMeasures: 1,
    wells: { dimensions: 'editor.wellCategory', measures: 'editor.wellValues' }, features: [], limit: 1,
  },
  trend: {
    group: 'single', minDimensions: 1, maxDimensions: 1, minMeasures: 1, maxMeasures: 2,
    wells: { dimensions: 'editor.wellTrendAxis', measures: 'editor.wellValueTarget' },
    measureSlots: ['editor.slotValue', 'editor.slotTarget'], features: ['target'], limit: 1000,
  },
  multirow: {
    group: 'single', minDimensions: 1, maxDimensions: 1, minMeasures: 1, maxMeasures: 20,
    wells: CATEGORY_VALUES, features: ['sort'], limit: 200,
  },
  table: {
    group: 'table', minDimensions: 0, maxDimensions: 10, minMeasures: 0, maxMeasures: 20,
    wells: { dimensions: 'editor.wellColumns', measures: 'editor.wellValues' }, features: ['sort', 'totals', 'dataBars'], limit: 500,
  },
  matrix: {
    group: 'table', minDimensions: 1, maxDimensions: 2, minMeasures: 1, maxMeasures: 20,
    wells: { dimensions: 'editor.wellRowsColumns', measures: 'editor.wellValues' },
    dimensionSlots: ['editor.slotRows', 'editor.slotColumns'], features: ['sort', 'totals'], limit: 2000,
  },
};

/** Types drawn on a category axis with a value axis (ECharts grid). */
export const CARTESIAN: WidgetType[] = ['column', 'bar', 'line', 'area', 'combo', 'waterfall'];
/** Types drawn as slices of one whole. */
export const RADIAL: WidgetType[] = ['pie', 'donut', 'funnel'];
/** Types rendered with ECharts; the rest are HTML (cards, tables). */
export const ECHARTS_TYPES: WidgetType[] = [...CARTESIAN, ...RADIAL, 'scatter', 'treemap', 'heatmap', 'radar', 'gauge'];

export const hasFeature = (type: WidgetType, f: ChartFeature) => CHART_SPECS[type].features.includes(f);

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
export const maxDimensions = (type: WidgetType): number => CHART_SPECS[type].maxDimensions;
export const maxMeasures = (type: WidgetType): number => CHART_SPECS[type].maxMeasures;

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

/** The combo chart draws every measure as a column except those marked `line`; with nothing marked, the last one is the line. */
export function comboRole(measures: Measure[], index: number): 'column' | 'line' {
  if (measures.some((m) => m.series)) return measures[index]?.series ?? 'column';
  return measures.length >= 2 && index === measures.length - 1 ? 'line' : 'column';
}

export function isRunnable(widget: Widget): boolean {
  return !!widget.datasourceId && !!widget.source && (widget.query.dimensions.length + widget.query.measures.length > 0);
}

/** Which well is still short for this type: the message to show instead of the chart and the well it names; null when the query can run. */
export function missingWells(widget: Widget): { message: TKey; well: TKey } | null {
  const spec = CHART_SPECS[widget.type];
  const dims = widget.query.dimensions.length;
  const measures = widget.query.measures.length;
  if (dims < spec.minDimensions) return { message: spec.minDimensions >= 2 ? 'editor.needsTwoDimensions' : 'editor.needsDimension', well: spec.wells.dimensions };
  if (measures < spec.minMeasures) return { message: spec.minMeasures >= 2 ? 'editor.needsTwoMeasures' : 'editor.needsMeasure', well: spec.wells.measures };
  return null;
}

/** The stacking in force: the option only counts for types that offer it, so it does not follow a widget into a line chart. */
export function stackingOf(widget: Widget): Stacking {
  if (!hasFeature(widget.type, 'stacking')) return 'none';
  return widget.options.stacking ?? (widget.options.stacked ? 'stacked' : 'none');
}

/** What the dashboard's filters add to the query (see lib/filters.ts); nothing when the dashboard has none. */
export interface QueryExtras { filters?: Filter[]; bucket?: DateBucket }

export function toQueryRequest(widget: Widget, extras: QueryExtras = {}): QueryRequest | null {
  if (!widget.datasourceId || !widget.source) return null;
  const q = widget.query;
  const orderBy = [...q.orderBy];
  // the sort option only acts where the pane offers it, so it does not follow a widget into a type without the control
  if (orderBy.length === 0 && q.measures.length && hasFeature(widget.type, 'sort') && widget.options.sortBy && widget.options.sortBy !== 'none') {
    const m = q.measures[0]!;
    orderBy.push({ alias: measureAlias(m), direction: widget.options.sortBy === 'measure_desc' ? 'desc' : 'asc' });
  }
  return {
    datasourceId: widget.datasourceId,
    source: widget.source,
    // a grain filter re-buckets every date dimension that already has a bucket; raw dates stay raw
    dimensions: q.dimensions.map(({ field, bucket, alias, kind }) => ({ field, bucket: extras.bucket && kind === 'date' && bucket && bucket !== 'none' ? extras.bucket : bucket ?? 'none', alias })),
    measures: q.measures.map(({ field, agg, alias }) => ({ field, agg, alias })),
    filters: [...q.filters, ...(extras.filters ?? [])].filter((f) => f.field).map(({ field, op, value, values }) => ({ field, op, value, values })),
    orderBy,
    limit: q.limit ?? CHART_SPECS[widget.type].limit,
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
export function widgetQueryKey(widget: Widget, extras: QueryExtras = {}): unknown[] {
  return ['widget-query', toQueryRequest(widget, extras)];
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
