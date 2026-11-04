export type Role = 'admin' | 'editor' | 'viewer';
export type AuthProvider = 'local' | 'entra';
export interface User {
  id: number; username: string; displayName: string; role: Role;
  /** Where the account came from; `entra` accounts may have no password. */
  provider: AuthProvider; hasPassword: boolean; email?: string | null; createdAt?: string;
}
/** Sign-in methods the server offers (`GET /auth/providers`). */
export interface AuthProviders { local: boolean; entra: boolean }

export interface Datasource {
  id: number; name: string; type: string; host: string; port: number; database: string; username: string; ssl: boolean;
  createdAt: string; updatedAt: string;
}
export interface DatasourceInput {
  name: string; host: string; port: number; database: string; username: string; password?: string; ssl: boolean;
}
export interface TableInfo { name: string; type: 'table' | 'view'; rows: number | null; comment: string }
export type FieldKind = 'number' | 'date' | 'string' | 'boolean' | 'other';
export interface FieldInfo { name: string; kind: FieldKind; dataType: string; nullable: boolean; isKey: boolean; comment?: string }

export interface Dataset { id: number; datasourceId: number; name: string; description: string; sql: string; createdAt: string; updatedAt: string }

/** Per-user UI preferences: a flat bag the client owns (see store/theme.ts); the server stores it as is. */
export type UserPreferences = Record<string, string | number | boolean>;

export type Aggregation = 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
export type DateBucket = 'none' | 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour';
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'between' | 'is_null' | 'not_null';
export const AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'];
export const DATE_BUCKETS: DateBucket[] = ['none', 'year', 'quarter', 'month', 'week', 'day', 'hour'];
export const FILTER_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'starts_with', 'between', 'is_null', 'not_null'];

export interface Dimension { field: string; bucket?: DateBucket; alias?: string; kind?: FieldKind }
export interface Measure {
  field: string; agg: Aggregation; alias?: string; kind?: FieldKind;
  /** combo chart only: drawn as a line on the secondary axis instead of a column */
  series?: 'column' | 'line';
}
export interface Filter { id: string; field: string; op: FilterOp; value?: string | number | boolean | null; values?: (string | number)[] }
export interface OrderBy { alias: string; direction: 'asc' | 'desc' }

export type QuerySource = { type: 'table'; table: string } | { type: 'dataset'; datasetId: number };

export interface QueryRequest {
  datasourceId: number;
  source: QuerySource;
  dimensions: Omit<Dimension, 'kind'>[];
  measures: Omit<Measure, 'kind' | 'series'>[];
  filters: Omit<Filter, 'id'>[];
  orderBy: OrderBy[];
  limit?: number;
}
export interface QueryResultColumn { alias: string; role: 'dimension' | 'measure' | 'column'; source?: string }
export interface QueryResult {
  columns: QueryResultColumn[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number; sql: string;
}

/**
 * Visual types, in the order the gallery shows them: compare, trend, part-to-whole, relation,
 * single value, tables. Their wells and options live in `lib/widget.ts` (`CHART_SPECS`).
 */
export type WidgetType =
  | 'column' | 'bar' | 'line' | 'area' | 'combo' | 'scatter' | 'waterfall' | 'funnel'
  | 'pie' | 'donut' | 'treemap' | 'heatmap' | 'radar'
  | 'gauge' | 'kpi' | 'trend' | 'multirow'
  | 'table' | 'matrix';
export const WIDGET_TYPES: WidgetType[] = [
  'column', 'bar', 'line', 'area', 'combo', 'scatter', 'waterfall', 'funnel',
  'pie', 'donut', 'treemap', 'heatmap', 'radar',
  'gauge', 'kpi', 'trend', 'multirow',
  'table', 'matrix',
];
export type NumberFormat = 'auto' | 'compact' | 'integer' | 'percent' | 'currency';
export type Stacking = 'none' | 'stacked' | 'percent';
export const STACKINGS: Stacking[] = ['none', 'stacked', 'percent'];
export type LegendPosition = 'bottom' | 'top' | 'right';
export const LEGEND_POSITIONS: LegendPosition[] = ['bottom', 'top', 'right'];

export interface WidgetOptions {
  legend?: boolean; legendPosition?: LegendPosition;
  /** before 0.2 a boolean; `stacking` supersedes it (the store normalizes old documents) */
  stacked?: boolean; stacking?: Stacking;
  showValues?: boolean; numberFormat?: NumberFormat;
  sortBy?: 'none' | 'measure_desc' | 'measure_asc';
  /** table / matrix: a totals row (and column) */
  showTotals?: boolean;
  /** table: a bar behind each numeric cell, proportional to the column's maximum */
  dataBars?: boolean;
  /** gauge: scale and target; a second measure overrides `target` */
  gaugeMin?: number; gaugeMax?: number; target?: number;
  /** cartesian analytics: a constant line and the series average */
  referenceLine?: number; averageLine?: boolean;
}
export interface WidgetQuery { dimensions: Dimension[]; measures: Measure[]; filters: Filter[]; orderBy: OrderBy[]; limit?: number }
export interface Widget {
  id: string; type: WidgetType; title: string;
  layout: { x: number; y: number; w: number; h: number };
  datasourceId: number | null; source: QuerySource | null;
  query: WidgetQuery; options: WidgetOptions;
}
export interface DashboardDefinition { version: 1; widgets: Widget[]; filters: unknown[]; settings: Record<string, unknown> }
export interface Dashboard {
  id: number; name: string; description: string; widgetCount: number; createdAt: string; updatedAt: string; definition?: DashboardDefinition;
}
export interface DashboardInput { name: string; description?: string; definition: DashboardDefinition }

export const emptyDefinition = (): DashboardDefinition => ({ version: 1, widgets: [], filters: [], settings: {} });

// --- AI suggestions --------------------------------------------------------------------------
export type AiProviderKind = 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
export const AI_PROVIDER_KINDS: AiProviderKind[] = ['anthropic', 'openai', 'gemini', 'openai_compatible'];
export interface AiProvider { id: number; name: string; kind: AiProviderKind; model: string; baseUrl: string; isDefault: boolean; createdAt: string; updatedAt: string }
export interface AiProviderInput { name: string; kind: AiProviderKind; model: string; baseUrl?: string; apiKey?: string; isDefault?: boolean }
export interface AiSuggestion {
  type: WidgetType; title: string; explanation: string;
  dimensions: { field: string; kind: FieldKind; bucket?: DateBucket }[];
  measures: { field: string; kind: FieldKind; agg: Aggregation }[];
  filters: Omit<Filter, 'id'>[];
  sortBy: NonNullable<WidgetOptions['sortBy']>;
}
export interface AiSuggestRequest { providerId?: number; sourceLabel: string; fields: Pick<FieldInfo, 'name' | 'kind' | 'dataType'>[]; prompt?: string; lang?: string; count?: number }
export interface AiSuggestResponse { suggestions: AiSuggestion[]; provider: AiProvider; durationMs: number }
/** Shape of a test endpoint answer (data source or AI provider). */
export interface TestResult { ok: boolean; latencyMs?: number; version?: string; model?: string; error?: string; code?: string; details?: unknown }
