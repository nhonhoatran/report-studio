import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { AGGREGATIONS, DATE_BUCKETS, FILTER_OPS, type Aggregation, type DateBucket, type FieldKind, type FilterOp } from '../query/types.js';

/**
 * Natural language -> chart specs. The model only ever fills the same semantic query the
 * drag-and-drop editor produces (fields, aggregations, buckets, filters); it never writes
 * SQL. Everything it returns is checked against the real field list before it reaches the
 * client, so a hallucinated column is dropped rather than executed.
 */
export const WIDGET_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'kpi', 'table'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
const SORTS = ['none', 'measure_desc', 'measure_asc'] as const;

export interface SuggestField { name: string; kind: FieldKind; dataType?: string }

export interface Suggestion {
  type: WidgetType;
  title: string;
  explanation: string;
  dimensions: { field: string; kind: FieldKind; bucket?: DateBucket }[];
  measures: { field: string; kind: FieldKind; agg: Aggregation }[];
  filters: { field: string; op: FilterOp; value?: string | number | boolean | null; values?: (string | number)[] }[];
  sortBy: (typeof SORTS)[number];
}

export const MAX_SUGGESTIONS = 8;

/** JSON schema handed to providers that support constrained output. Kept to the common subset. */
export const SUGGESTIONS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...WIDGET_TYPES] },
          title: { type: 'string' },
          explanation: { type: 'string' },
          dimensions: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, bucket: { type: 'string', enum: [...DATE_BUCKETS] } },
              required: ['field'],
              additionalProperties: false,
            },
          },
          measures: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, agg: { type: 'string', enum: [...AGGREGATIONS] } },
              required: ['field', 'agg'],
              additionalProperties: false,
            },
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                op: { type: 'string', enum: [...FILTER_OPS] },
                value: { type: ['string', 'number', 'boolean', 'null'] },
                values: { type: 'array', items: { type: ['string', 'number'] } },
              },
              required: ['field', 'op'],
              additionalProperties: false,
            },
          },
          sortBy: { type: 'string', enum: [...SORTS] },
        },
        required: ['type', 'title', 'dimensions', 'measures'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

const LANGUAGE_NAMES: Record<string, string> = { vi: 'Vietnamese', en: 'English' };

export interface PromptInput { sourceLabel: string; fields: SuggestField[]; prompt?: string; lang?: string; count?: number }

export function buildPrompt(input: PromptInput): { system: string; user: string } {
  const language = LANGUAGE_NAMES[input.lang ?? 'vi'] ?? input.lang ?? 'Vietnamese';
  const count = Math.min(Math.max(input.count ?? 4, 1), MAX_SUGGESTIONS);
  const system = [
    'You are the chart assistant inside Report Studio, a drag-and-drop BI tool.',
    'You propose visual configurations for a dashboard; you never write SQL.',
    'Answer with JSON only: {"suggestions":[...]} following the schema. No prose outside the JSON.',
    '',
    'Each suggestion has: type, title, explanation, dimensions, measures, filters (optional), sortBy (optional).',
    `type: one of ${WIDGET_TYPES.join(', ')}.`,
    `aggregations (measures[].agg): ${AGGREGATIONS.join(', ')}. sum/avg only on number fields; use count or count_distinct for text, date and boolean fields. field "*" with count means row count.`,
    `date buckets (dimensions[].bucket, date fields only): ${DATE_BUCKETS.join(', ')}.`,
    `filter ops: ${FILTER_OPS.join(', ')}. Only add a filter when the request asks for one.`,
    'Shape rules: kpi has 0 dimensions and 1 measure; pie/donut have 1 dimension and 1 measure; column/bar/line/area have 1-2 dimensions (axis, then legend) and at least 1 measure; table has up to 10 dimensions and any measures.',
    'Use field names exactly as listed; never invent fields. Prefer time series on a date field for trends, bar/column for comparisons, kpi for a single headline number.',
    `Write title and explanation in ${language}. Keep titles under 60 characters and explanations to one sentence.`,
    'Make the suggestions diverse: different chart types and different questions about the data.',
  ].join('\n');
  const fieldLines = input.fields.map((f) => `- ${f.name} (${f.kind}${f.dataType ? `, ${f.dataType}` : ''})`).join('\n');
  const ask = input.prompt?.trim() || 'Suggest the most useful visuals to understand this dataset.';
  const user = `Dataset: ${input.sourceLabel}\nFields:\n${fieldLines}\n\nRequest: ${ask}\n\nReturn exactly ${count} suggestions.`;
  return { system, user };
}

// --- parsing -------------------------------------------------------------------------------

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rawSuggestion = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  explanation: z.string().optional(),
  dimensions: z.array(z.object({ field: z.string(), bucket: z.string().optional().nullable() }).passthrough()).optional(),
  measures: z.array(z.object({ field: z.string(), agg: z.string().optional().nullable() }).passthrough()).optional(),
  filters: z.array(z.object({ field: z.string(), op: z.string(), value: scalar.optional(), values: z.array(z.union([z.string(), z.number()])).optional() }).passthrough()).optional(),
  sortBy: z.string().optional().nullable(),
}).passthrough();
const rawPayload = z.union([z.object({ suggestions: z.array(rawSuggestion) }).passthrough(), z.array(rawSuggestion)]);
export type RawSuggestion = z.infer<typeof rawSuggestion>;

const badResponse = (detail: string) => new HttpError(502, `AI provider returned an unusable answer: ${detail}`, 'ai_bad_response', { detail });

/** Pull the JSON out of whatever the model wrote (code fences, a preamble, a bare array). */
export function parseSuggestions(text: string): RawSuggestion[] {
  let body = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fenced?.[1]) body = fenced[1].trim();
  const firstObj = body.indexOf('{'); const firstArr = body.indexOf('[');
  const start = [firstObj, firstArr].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) throw badResponse('no JSON found');
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  body = body.slice(start, end + 1);
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw badResponse('invalid JSON'); }
  const parsed = rawPayload.safeParse(json);
  if (!parsed.success) throw badResponse('unexpected shape');
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.suggestions;
}

// --- validation against the real fields ---------------------------------------------------------

const maxDimensions = (t: WidgetType) => (t === 'kpi' ? 0 : t === 'table' ? 10 : t === 'pie' || t === 'donut' ? 1 : 2);
const maxMeasures = (t: WidgetType) => (t === 'kpi' || t === 'pie' || t === 'donut' ? 1 : 20);
const isIn = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && (list as readonly string[]).includes(v);

export function sanitizeSuggestions(raw: RawSuggestion[], fields: SuggestField[]): Suggestion[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const type: WidgetType = isIn(WIDGET_TYPES, s.type) ? s.type : 'column';
    const dimensions: Suggestion['dimensions'] = [];
    for (const d of s.dimensions ?? []) {
      const f = byName.get(d.field);
      if (!f || dimensions.some((x) => x.field === f.name)) continue;
      if (dimensions.length >= maxDimensions(type)) break;
      const bucket = f.kind === 'date' ? (isIn(DATE_BUCKETS, d.bucket) ? d.bucket : 'month') : undefined;
      dimensions.push({ field: f.name, kind: f.kind, ...(bucket ? { bucket } : {}) });
    }
    const measures: Suggestion['measures'] = [];
    for (const m of s.measures ?? []) {
      if (measures.length >= maxMeasures(type)) break;
      if (m.field === '*') {
        if (measures.some((x) => x.field === '*')) continue;
        measures.push({ field: '*', kind: 'number', agg: 'count' });
        continue;
      }
      const f = byName.get(m.field);
      if (!f || measures.some((x) => x.field === f.name)) continue;
      let agg: Aggregation = isIn(AGGREGATIONS, m.agg) ? m.agg : f.kind === 'number' ? 'sum' : 'count';
      if ((agg === 'sum' || agg === 'avg') && f.kind !== 'number') agg = 'count';
      measures.push({ field: f.name, kind: f.kind, agg });
    }
    const filters: Suggestion['filters'] = [];
    for (const fl of s.filters ?? []) {
      const f = byName.get(fl.field);
      if (!f || !isIn(FILTER_OPS, fl.op)) continue;
      filters.push({ field: f.name, op: fl.op, ...(fl.value !== undefined ? { value: fl.value } : {}), ...(fl.values ? { values: fl.values.slice(0, 50) } : {}) });
    }
    // a visual the editor could not run is not a suggestion
    if (measures.length === 0 && !(type === 'table' && dimensions.length > 0)) continue;
    if ((type === 'pie' || type === 'donut') && dimensions.length === 0) continue;
    const key = `${type}|${dimensions.map((d) => `${d.field}:${d.bucket ?? ''}`).join(',')}|${measures.map((m) => `${m.agg}:${m.field}`).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = (s.title ?? '').trim().slice(0, 120) || `${measures[0] ? `${measures[0].agg} ${measures[0].field === '*' ? '' : measures[0].field}`.trim() : dimensions[0]?.field ?? ''}${dimensions[0] && measures[0] ? ` · ${dimensions[0].field}` : ''}`;
    out.push({
      type, title, explanation: (s.explanation ?? '').trim().slice(0, 300),
      dimensions, measures, filters,
      sortBy: isIn(SORTS, s.sortBy) ? s.sortBy : 'none',
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
