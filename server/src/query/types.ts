import { z } from 'zod';

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

export const measureSchema = z.object({
  field: identifier.or(z.literal('*')),
  agg: z.enum(AGGREGATIONS),
  alias: identifier.optional(),
});

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
});

export type Dimension = z.infer<typeof dimensionSchema>;
export type Measure = z.infer<typeof measureSchema>;
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

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  sql: string;
}
