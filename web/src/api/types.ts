/** A role name: one of the built-in three (admin, editor, viewer) or a custom row of the roles table. */
export type Role = string;
export type AuthProvider = 'local' | 'entra';
/** Mirrors server/src/auth/permissions.ts; the server decides, the client only hides what is not allowed. */
export const PERMISSIONS = [
  'dashboards.view', 'dashboards.edit', 'dashboards.filters',
  'datasources.view', 'datasources.manage', 'datasets.manage',
  'ai.suggest', 'ai.manage',
  'users.manage', 'roles.manage', 'policies.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
/** The user's ABAC attributes: every value a list ("region": ["Hà Nội"]). */
export type UserAttributes = Record<string, string[]>;
export interface User {
  id: number; username: string; displayName: string; role: Role;
  /** Where the account came from; `entra` accounts may have no password. */
  provider: AuthProvider; hasPassword: boolean; email?: string | null; createdAt?: string;
  permissions: Permission[]; attributes: UserAttributes;
}
export interface RoleDefinition { name: string; label: string; permissions: Permission[]; builtin: boolean }

// --- ABAC policies ----------------------------------------------------------------------------------
export type ResourceType = 'dashboard' | 'datasource';
export type PolicyAction = 'view' | 'edit' | 'query' | 'manage';
export const RESOURCE_ACTIONS: Record<ResourceType, PolicyAction[]> = { dashboard: ['view', 'edit'], datasource: ['query', 'manage'] };
export interface AccessPolicy {
  id: number; name: string; enabled: boolean; effect: 'allow' | 'deny';
  subject: { roles: string[]; attributes: Record<string, string[]> };
  resource: { type: ResourceType; ids: number[] };
  actions: PolicyAction[];
  rowFilters: { field: string; attribute: string }[];
}
export type AccessPolicyInput = Omit<AccessPolicy, 'id'>;
/** Sign-in methods the server offers (`GET /auth/providers`). */
export interface AuthProviders { local: boolean; entra: boolean }

export interface Datasource {
  id: number; name: string; type: string; host: string; port: number; database: string; username: string; ssl: boolean;
  /** seconds a query result is served from the server cache; null = the server default */
  cacheTtlSeconds?: number | null;
  createdAt: string; updatedAt: string;
}
export interface DatasourceInput {
  name: string; host: string; port: number; database: string; username: string; password?: string; ssl: boolean; cacheTtlSeconds?: number | null;
}
/** The server's limits the client sizes its controls by (`GET /config`). */
export interface ClientConfig { filterValueLimit: number; exportMaxRows: number; cacheTtlSeconds: number }
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

/** How a measure is shown: as is, or as its share of a total the server computes over the same query. */
export type ShowAs = 'value' | 'percent_of_total' | 'percent_of_parent' | 'percent_of_column';
export const SHOW_AS: ShowAs[] = ['value', 'percent_of_total', 'percent_of_parent', 'percent_of_column'];

export interface Dimension {
  field: string; bucket?: DateBucket; alias?: string; kind?: FieldKind;
  /** the name a reader sees instead of the column name */
  label?: string;
}
export interface Measure {
  field: string; agg: Aggregation; alias?: string; kind?: FieldKind;
  /** the name a reader sees instead of "Sum revenue"; a formula may refer to the measure by it */
  label?: string;
  /**
   * A calculated measure: an expression over the widget's other measures (`[Doanh số] / [sum_cost]`)
   * or over columns (`sum(a) / count(*)`), evaluated by the server after GROUP BY. `field` and `agg`
   * are then unused; `alias` is always set so other formulas and sorts can name it.
   */
  formula?: string;
  showAs?: ShowAs;
  /** this measure's own number format, over the widget's; a share is always a percent */
  format?: NumberFormat;
  /** combo chart only: drawn as a line on the secondary axis instead of a column */
  series?: 'column' | 'line';
}
export const isFormula = (m: Measure): boolean => typeof m.formula === 'string';
export interface Filter { id: string; field: string; op: FilterOp; value?: string | number | boolean | null; values?: (string | number)[] }
export interface OrderBy { alias: string; direction: 'asc' | 'desc' }

export type QuerySource = { type: 'table'; table: string } | { type: 'dataset'; datasetId: number };

/** What the server reads of a measure: an aggregation or a formula, each with its alias, display name and show-as. */
export type QueryMeasure =
  | { field: string; agg: Aggregation; alias?: string; label?: string; showAs?: ShowAs }
  | { formula: string; alias?: string; label?: string; showAs?: ShowAs };
export interface QueryRequest {
  datasourceId: number;
  source: QuerySource;
  dimensions: Omit<Dimension, 'kind' | 'label'>[];
  measures: QueryMeasure[];
  filters: Omit<Filter, 'id'>[];
  orderBy: OrderBy[];
  limit?: number;
  /** rows to skip (a table's page) */
  offset?: number;
  /** skip the server's result cache (the refresh button) */
  fresh?: boolean;
  /** ask the server for every measure over all groups, and per first / second dimension value */
  totals?: boolean;
  /** subtotals: every measure over the groups sharing these dimensions' values, one list per set (the matrix's levels) */
  subtotals?: number[][];
}
export interface QueryResultColumn { alias: string; role: 'dimension' | 'measure' | 'column'; source?: string }
/** Totals the server computed in the same statement, keyed by measure alias (and by dimension value as text). */
export interface QueryTotals { grand: Record<string, unknown>; byRow?: Record<string, Record<string, unknown>>; byColumn?: Record<string, Record<string, unknown>> }
/** Subtotals by the dimensions they are over ("0,2"), then by those dimensions' values as a JSON array of texts, then by measure alias. */
export type QuerySubtotals = Record<string, Record<string, Record<string, unknown>>>;
export interface QueryResult {
  columns: QueryResultColumn[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number; sql: string;
  totals?: QueryTotals;
  subtotals?: QuerySubtotals;
  /** when the rows were read from the source (ISO); a cached answer keeps its stamp and says so */
  dataAt?: string;
  fromCache?: boolean;
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

// --- Conditional formatting (tables, matrices) ----------------------------------------------------
export type ConditionalColor = 'success' | 'danger' | 'warning' | 'primary' | 'muted';
export const CONDITIONAL_COLORS: ConditionalColor[] = ['success', 'danger', 'warning', 'primary', 'muted'];
export type ConditionalOp = 'gte' | 'gt' | 'lte' | 'lt' | 'eq' | 'between';
export const CONDITIONAL_OPS: ConditionalOp[] = ['gte', 'gt', 'lte', 'lt', 'eq', 'between'];
export interface ConditionalRule { id: string; op: ConditionalOp; value: number; value2?: number; color: ConditionalColor; icon?: 'up' | 'down' }
export interface ConditionalFormat {
  /** colour the text or the cell's background */
  apply: 'text' | 'background';
  /** the first matching rule wins */
  rules: ConditionalRule[];
  /** with no matching rule: a colour between two tokens by the value's place between the column's minimum and maximum */
  scale?: { from: ConditionalColor; to: ConditionalColor };
  /** also colour the totals */
  totals?: boolean;
}

export interface WidgetOptions {
  legend?: boolean; legendPosition?: LegendPosition;
  /** before 0.2 a boolean; `stacking` supersedes it (the store normalizes old documents) */
  stacked?: boolean; stacking?: Stacking;
  showValues?: boolean; numberFormat?: NumberFormat;
  sortBy?: 'none' | 'measure_desc' | 'measure_asc';
  /** table / matrix: a totals row (and column) */
  showTotals?: boolean;
  /** matrix: how many of the trailing dimensions go across the columns (the rest are row levels); absent = one when there are two or more */
  matrixColumns?: number;
  /** matrix: how many row levels are open when it first shows (1 = only the first level); absent = 1 */
  matrixExpand?: number;
  /** table: a bar behind each numeric cell, proportional to the column's maximum */
  dataBars?: boolean;
  /** gauge: scale, and whether the target mark and label are drawn; a second measure overrides `target` (gauge, KPI with trend) */
  gaugeMin?: number; gaugeMax?: number; showTarget?: boolean; target?: number;
  /** cartesian analytics: a constant line and the series average */
  referenceLine?: number; averageLine?: boolean;
  /** combo: lines share the columns' axis instead of a second one */
  sharedAxis?: boolean;
  /** table / matrix: conditional formatting by measure alias */
  conditional?: Record<string, ConditionalFormat>;
}
export interface WidgetQuery { dimensions: Dimension[]; measures: Measure[]; filters: Filter[]; orderBy: OrderBy[]; limit?: number }
export interface Widget {
  id: string; type: WidgetType; title: string;
  layout: { x: number; y: number; w: number; h: number };
  datasourceId: number | null; source: QuerySource | null;
  query: WidgetQuery; options: WidgetOptions;
}
// --- Dashboard-level filters (slicers) ------------------------------------------------------------
export type DashboardFilterKind = 'date_range' | 'grain' | 'list';
export const DASHBOARD_FILTER_KINDS: DashboardFilterKind[] = ['date_range', 'grain', 'list'];
export type DatePreset = 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';
export const DATE_PRESETS: DatePreset[] = ['all', 'today', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom'];
/** What a filter currently selects; which keys are read depends on the filter's kind. */
export interface FilterValue {
  /** date_range */ preset?: DatePreset; from?: string; to?: string;
  /** grain */ bucket?: DateBucket;
  /** list: empty means "All" */ values?: (string | number)[];
}
export interface DashboardFilter {
  id: string;
  kind: DashboardFilterKind;
  label: string;
  /** the page it is shown on and applies to; absent means the whole report */
  pageId?: string;
  /** date_range and list: the column it filters, on every visual of the data source whose source has it */
  field?: string;
  /** list: where its choices are read from; date_range: the data source it belongs to */
  datasourceId?: number | null;
  source?: QuerySource | null;
  /** list: several values at once */
  multi?: boolean;
  /** list: do not narrow the choices by the other filters of the same source */
  independent?: boolean;
  /** the saved selection, which every viewer starts from */
  value?: FilterValue;
}

/** One page of a report: its own widgets and layout; filters are the report's and pick a page or all of them. */
export interface DashboardPage { id: string; name: string; widgets: Widget[] }
/** Version 2 of the document: widgets live on pages. A version 1 document (top-level `widgets`) is read as one page. */
export interface DashboardDefinition { version: 2; pages: DashboardPage[]; filters: DashboardFilter[]; settings: Record<string, unknown> }
export interface LegacyDashboardDefinition { version: 1; widgets: Widget[]; filters: DashboardFilter[]; settings: Record<string, unknown> }
export interface Dashboard {
  id: number; name: string; description: string; widgetCount: number; pageCount?: number; createdAt: string; updatedAt: string;
  definition?: DashboardDefinition | LegacyDashboardDefinition;
  /** the server's answer for this user: the permission and no policy against it */
  canEdit?: boolean;
}
export interface DashboardInput { name: string; description?: string; definition: DashboardDefinition }

export const emptyDefinition = (firstPage: DashboardPage): DashboardDefinition => ({ version: 2, pages: [firstPage], filters: [], settings: {} });

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
