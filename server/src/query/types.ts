import { z } from 'zod';
import { FORMULA_MAX_LENGTH } from '../shared/formula.js';

export const AGGREGATIONS = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const DATE_BUCKETS = ['none', 'year', 'quarter', 'month', 'week', 'day', 'hour'] as const;
export type DateBucket = (typeof DATE_BUCKETS)[number];

export const FILTER_OPS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in',
  'contains', 'starts_with', 'between', 'is_null', 'not_null',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

// Identifier used for a column or table name. MariaDB allows almost anything inside
// backticks; we only forbid characters that cannot appear in a quoted identifier.
const identifier = z
  .string()
  .min(1)
  .max(64)
  .refine((s) => !s.includes('\0'), 'identifier must not contain NUL');

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const dimensionSchema = z.object({
  field: identifier,
  bucket: z.enum(DATE_BUCKETS).optional(),
  alias: identifier.optional(),
});

/** How a measure is shown: as is, or as its share of a total computed over the same query (window functions). */
export const SHOW_AS = ['value', 'percent_of_total', 'percent_of_parent', 'percent_of_column'] as const;
export type ShowAs = (typeof SHOW_AS)[number];

/** A display name travels with the measure so a formula may refer to it by that name. */
const label = z.string().max(200).optional();

export const aggMeasureSchema = z.object({
  field: identifier.or(z.literal('*')),
  agg: z.enum(AGGREGATIONS),
  alias: identifier.optional(),
  label,
  showAs: z.enum(SHOW_AS).optional(),
});

/** A calculated measure: an expression over the widget's other measures, evaluated after GROUP BY (see shared/formula.ts). */
export const formulaMeasureSchema = z.object({
  formula: z.string().min(1).max(FORMULA_MAX_LENGTH),
  alias: identifier.optional(),
  label,
  showAs: z.enum(SHOW_AS).optional(),
});

export const measureSchema = z.union([formulaMeasureSchema, aggMeasureSchema]);

export const filterSchema = z.object({
  field: identifier,
  op: z.enum(FILTER_OPS),
  value: scalar.optional(),
  values: z.array(scalar).max(500).optional(),
});

export const orderBySchema = z.object({
  alias: identifier,
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const sourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('table'), table: identifier }),
  z.object({ type: z.literal('dataset'), datasetId: z.number().int().positive() }),
  z.object({ type: z.literal('sql'), sql: z.string().min(1).max(100_000) }),
]);

export const queryRequestSchema = z.object({
  datasourceId: z.number().int().positive(),
  source: sourceSchema,
  dimensions: z.array(dimensionSchema).max(10).default([]),
  measures: z.array(measureSchema).max(20).default([]),
  filters: z.array(filterSchema).max(30).default([]),
  orderBy: z.array(orderBySchema).max(5).default([]),
  limit: z.number().int().positive().max(100_000).optional(),
  /** also compute every measure over all groups (and, with two or more dimensions, per first and per second dimension value) */
  totals: z.boolean().optional(),
});

export type Dimension = z.infer<typeof dimensionSchema>;
export type AggMeasure = z.infer<typeof aggMeasureSchema>;
export type FormulaMeasure = z.infer<typeof formulaMeasureSchema>;
export type Measure = z.infer<typeof measureSchema>;
export const isFormulaMeasure = (m: Measure): m is FormulaMeasure => 'formula' in m && typeof m.formula === 'string';
export type Filter = z.infer<typeof filterSchema>;
export type OrderBy = z.infer<typeof orderBySchema>;
export type QuerySource = z.infer<typeof sourceSchema>;
export type QueryRequest = z.infer<typeof queryRequestSchema>;

export type FieldKind = 'number' | 'date' | 'string' | 'boolean' | 'other';

export interface FieldInfo {
  name: string;
  kind: FieldKind;
  dataType: string;
  nullable: boolean;
  isKey: boolean;
  comment?: string;
}

export interface QueryResultColumn {
  alias: string;
  role: 'dimension' | 'measure' | 'column';
  source?: string;
}

/**
 * Totals computed by the data source in the same statement: every measure over all groups, and
 * with two or more dimensions also per value of the first dimension (`byRow`) and of the second
 * (`byColumn`), keyed by that value as text. A measure the source cannot total (count distinct) is null.
 */
export interface QueryTotals {
  grand: Record<string, unknown>;
  byRow?: Record<string, Record<string, unknown>>;
  byColumn?: Record<string, Record<string, unknown>>;
}

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  sql: string;
  totals?: QueryTotals;
}
