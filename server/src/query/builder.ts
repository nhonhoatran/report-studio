import { badRequest } from '../lib/errors.js';
import { checkFormula, type FormulaAggregation, type FormulaNode, type MeasureRef } from '../shared/formula.js';
import { isFormulaMeasure, type AggMeasure, type Dimension, type Filter, type Measure, type OrderBy, type QueryRequest, type QueryResultColumn, type QuerySubtotals, type QueryTotals, type ShowAs } from './types.js';

export interface BuiltTotals {
  /** result column that holds each measure's total over all groups, by measure alias */
  grand: Record<string, string>;
  /** with two or more dimensions: the same per value of the first dimension (`byRow`) and of the second (`byColumn`) */
  byRow?: Record<string, string>;
  byColumn?: Record<string, string>;
  rowDim?: string;
  colDim?: string;
}

/** One requested subtotal: the dimensions it is taken over and the result column per measure alias. */
export interface BuiltSubtotal { dims: number[]; key: string; columns: Record<string, string> }
export interface BuiltSubtotals { partitions: BuiltSubtotal[]; dimAliases: string[] }

export interface BuiltQuery {
  sql: string;
  params: unknown[];
  columns: QueryResultColumn[];
  limit: number;
  /** where the totals landed, when the request asked for them (`extractTotals` lifts them out of the rows) */
  totals?: BuiltTotals;
  /** where the subtotals landed (`extractSubtotals`) */
  subtotals?: BuiltSubtotals;
}

export function quoteIdent(name: string): string {
  if (!name || name.includes('\0')) throw badRequest(`Invalid identifier: ${name}`, 'invalid_identifier', { name });
  return '`' + name.replace(/`/g, '``') + '`';
}

/** `db.table` -> `db`.`table`; a bare name is quoted as one identifier. */
export function quoteQualified(name: string): string {
  const parts = name.split('.');
  if (parts.length > 2) throw badRequest(`Invalid table name: ${name}`, 'invalid_table', { name });
  return parts.map(quoteIdent).join('.');
}

function safeAlias(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
  return cleaned || 'col';
}

function dimensionExpr(d: Dimension): string {
  const raw = quoteIdent(d.field);
  // the previous period's rows are moved forward onto the current period's keys
  const col = d.shift && d.shift.n !== 0 ? `DATE_ADD(${raw}, INTERVAL ${Math.trunc(d.shift.n)} ${d.shift.unit})` : raw;
  switch (d.bucket ?? 'none') {
    case 'none': return col;
    case 'year': return `DATE_FORMAT(${col}, '%Y')`;
    case 'quarter': return `CONCAT(YEAR(${col}), '-Q', QUARTER(${col}))`;
    case 'month': return `DATE_FORMAT(${col}, '%Y-%m')`;
    case 'week': return `DATE_FORMAT(${col}, '%x-W%v')`;
    case 'day': return `DATE_FORMAT(${col}, '%Y-%m-%d')`;
    case 'hour': return `DATE_FORMAT(${col}, '%Y-%m-%d %H:00')`;
  }
}

function dimensionAlias(d: Dimension): string {
  if (d.alias) return safeAlias(d.alias);
  return safeAlias(d.bucket && d.bucket !== 'none' ? `${d.field}_${d.bucket}` : d.field);
}

/**
 * One aggregation as SQL. Without a window it is the group's value; with one (`OVER (...)`) it is
 * the same aggregation over every group the window covers, which is how totals come out of the
 * same statement: a sum of sums, a count of counts, an average re-weighted from sums and counts,
 * the extreme of the extremes. A distinct count cannot be re-aggregated, so its total is NULL.
 */
function aggExpr(agg: FormulaAggregation, field: string, window?: string): string {
  const col = field === '*' ? '*' : quoteIdent(field);
  if (agg === 'count_distinct' && field === '*') throw badRequest('count_distinct needs a field', 'count_distinct_needs_field');
  if (!window) {
    switch (agg) {
      case 'sum': return `SUM(${col})`;
      case 'avg': return `AVG(${col})`;
      case 'min': return `MIN(${col})`;
      case 'max': return `MAX(${col})`;
      case 'count': return `COUNT(${col})`;
      case 'count_distinct': return `COUNT(DISTINCT ${col})`;
    }
  }
  switch (agg) {
    case 'sum': return `SUM(SUM(${col})) ${window}`;
    case 'count': return `SUM(COUNT(${col})) ${window}`;
    case 'avg': return `(SUM(SUM(${col})) ${window} / NULLIF(SUM(COUNT(${col})) ${window}, 0))`;
    case 'min': return `MIN(MIN(${col})) ${window}`;
    case 'max': return `MAX(MAX(${col})) ${window}`;
    case 'count_distinct': return 'NULL';
  }
}

function measureAlias(m: Measure, index: number): string {
  if (m.alias) return safeAlias(m.alias);
  if (isFormulaMeasure(m)) return `formula_${index + 1}`;
  return safeAlias(`${m.agg}_${m.field === '*' ? 'all' : m.field}`);
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function buildWhere(filters: Filter[], params: unknown[]): string {
  const clauses: string[] = [];
  for (const f of filters) {
    const col = quoteIdent(f.field);
    switch (f.op) {
      case 'eq': clauses.push(`${col} = ?`); params.push(f.value ?? null); break;
      case 'neq': clauses.push(`${col} <> ?`); params.push(f.value ?? null); break;
      case 'gt': clauses.push(`${col} > ?`); params.push(f.value ?? null); break;
      case 'gte': clauses.push(`${col} >= ?`); params.push(f.value ?? null); break;
      case 'lt': clauses.push(`${col} < ?`); params.push(f.value ?? null); break;
      case 'lte': clauses.push(`${col} <= ?`); params.push(f.value ?? null); break;
      case 'in':
      case 'not_in': {
        const values = f.values ?? (f.value !== undefined ? [f.value] : []);
        if (values.length === 0) { clauses.push(f.op === 'in' ? '1 = 0' : '1 = 1'); break; }
        clauses.push(`${col} ${f.op === 'in' ? 'IN' : 'NOT IN'} (${values.map(() => '?').join(', ')})`);
        params.push(...values);
        break;
      }
      case 'contains':
        clauses.push(`${col} LIKE ? ESCAPE '\\\\'`);
        params.push(`%${escapeLike(String(f.value ?? ''))}%`);
        break;
      case 'starts_with':
        clauses.push(`${col} LIKE ? ESCAPE '\\\\'`);
        params.push(`${escapeLike(String(f.value ?? ''))}%`);
        break;
      case 'between': {
        const [a, b] = f.values ?? [];
        if (a === undefined || b === undefined) throw badRequest('between needs two values', 'between_needs_two_values');
        clauses.push(`${col} BETWEEN ? AND ?`);
        params.push(a, b);
        break;
      }
      case 'is_null': clauses.push(`${col} IS NULL`); break;
      case 'not_null': clauses.push(`${col} IS NOT NULL`); break;
    }
  }
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

function buildOrderBy(orderBy: OrderBy[], known: Set<string>): string {
  if (!orderBy.length) return '';
  const parts = orderBy.map((o) => {
    const alias = safeAlias(o.alias);
    if (!known.has(alias)) throw badRequest(`Cannot order by unknown column "${o.alias}"`, 'order_by_unknown', { alias: o.alias });
    return `${quoteIdent(alias)} ${o.direction === 'desc' ? 'DESC' : 'ASC'}`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

/** The dimensions a "show as" share is taken within: none for the grand total, the first for a parent, the second for a column. */
function shareDimensions(showAs: ShowAs | undefined, dimensionCount: number): number[] | null {
  switch (showAs) {
    case 'percent_of_total': return [];
    case 'percent_of_parent': return dimensionCount >= 2 ? Array.from({ length: dimensionCount - 1 }, (_, i) => i) : [];
    case 'percent_of_column': return dimensionCount >= 2 ? [1] : [];
    default: return null;
  }
}

/**
 * Renders every measure of a request: the per-group value, and the same measure over a wider
 * window for totals and "show as" shares. Numbers typed into a formula become `?` parameters;
 * nothing a user wrote is spliced into the SQL. Parameters are pushed in the order the text is
 * emitted, so rendering the same expression twice repeats them in the right places.
 */
class MeasureRenderer {
  private readonly asts = new Map<number, FormulaNode>();
  private readonly refs: MeasureRef[];
  /** the dimension a running total follows: the period's column, else the first bucketed one */
  private readonly dateIndex: number;
  constructor(private readonly measures: Measure[], private readonly aliases: string[], private readonly dimensions: Dimension[], private readonly params: unknown[], periodField?: string) {
    const byField = periodField ? dimensions.findIndex((d) => d.field === periodField) : -1;
    this.dateIndex = byField >= 0 ? byField : dimensions.findIndex((d) => d.bucket && d.bucket !== 'none');
    this.refs = measures.map((m, i) => ({ alias: aliases[i]!, label: m.label, formula: isFormulaMeasure(m) ? m.formula : undefined }));
    measures.forEach((m, i) => {
      if (!isFormulaMeasure(m)) return;
      const checked = checkFormula(this.refs[i]!, this.refs);
      if (!checked.ok) {
        throw badRequest(`Invalid formula "${aliases[i]}": ${checked.error.code} at ${checked.error.position}`, 'formula_invalid',
          { alias: aliases[i], reason: checked.error.code, position: checked.error.position, token: checked.error.token });
      }
      this.asts.set(i, checked.ast);
    });
  }

  /** `OVER ()` or `OVER (PARTITION BY <dimension expressions>)`. */
  window(dims: number[]): string {
    const parts = dims.map((i) => this.dimensions[i]).filter((d): d is Dimension => !!d).map(dimensionExpr);
    return parts.length ? `OVER (PARTITION BY ${parts.join(', ')})` : 'OVER ()';
  }

  /** The measure before any "show as": its own value per group, or over `window` when given. */
  base(index: number, window?: string): string {
    const m = this.measures[index]!;
    if (!isFormulaMeasure(m)) return aggExpr(m.agg, m.field, window);
    return this.node(this.asts.get(index)!, window, [index]);
  }

  private node(n: FormulaNode, window: string | undefined, trail: number[]): string {
    switch (n.type) {
      case 'number': this.params.push(n.value); return '?';
      case 'neg': return `(-${this.node(n.arg, window, trail)})`;
      case 'binary': {
        const l = this.node(n.left, window, trail);
        const r = this.node(n.right, window, trail);
        // a division by zero (or by nothing) is an empty cell, never an error or an infinity
        return n.op === '/' ? `(${l} / NULLIF(${r}, 0))` : `(${l} ${n.op} ${r})`;
      }
      case 'agg': {
        if (n.field !== '*' && (n.field.length > 64 || n.field.includes('\0'))) throw badRequest(`Invalid field in formula: ${n.field}`, 'formula_invalid', { reason: 'bad_argument', position: n.start, token: n.field });
        return aggExpr(n.agg, n.field, window);
      }
      case 'ref': {
        const target = this.refs.findIndex((r) => r.alias.toLowerCase() === n.name.trim().toLowerCase());
        const idx = target >= 0 ? target : this.refs.findIndex((r) => r.label !== undefined && r.label.trim().toLowerCase() === n.name.trim().toLowerCase());
        // checkFormula already rejected unknown names and cycles
        if (idx < 0 || trail.includes(idx)) throw badRequest(`Unknown measure "${n.name}" in formula`, 'formula_invalid', { reason: 'unknown_ref', position: n.start, token: n.name });
        const m = this.measures[idx]!;
        if (!isFormulaMeasure(m)) return aggExpr(m.agg, m.field, window);
        return `(${this.node(this.asts.get(idx)!, window, [...trail, idx])})`;
      }
    }
  }

  /** What the cell shows per group: the value, or its share of the total the "show as" names, or its running total along the date. */
  value(index: number): string {
    const m = this.measures[index]!;
    const share = shareDimensions(m.showAs, this.dimensions.length);
    const base = this.base(index);
    const shown = share === null ? base : `(${base} / NULLIF(SUM(${this.base(index)}) ${this.window(share)}, 0))`;
    if (!m.cumulative || this.dateIndex < 0) return shown;
    // a running total: the other dimensions partition it, the date orders it
    const others = this.dimensions.map((_, i) => i).filter((i) => i !== this.dateIndex);
    const partition = others.length ? `PARTITION BY ${others.map((i) => dimensionExpr(this.dimensions[i]!)).join(', ')} ` : '';
    return `SUM(${shown}) OVER (${partition}ORDER BY ${dimensionExpr(this.dimensions[this.dateIndex]!)} ROWS UNBOUNDED PRECEDING)`;
  }

  /**
   * The measure totalled over `totalDims` (none = all groups). A share keeps its meaning: it is
   * taken within the dimensions both the share and the total have, so a row total of "% of row" is
   * 100 % and a row total of "% of grand total" is that row's share of everything.
   */
  total(index: number, totalDims: number[]): string {
    const share = shareDimensions(this.measures[index]!.showAs, this.dimensions.length);
    const base = this.base(index, this.window(totalDims));
    if (share === null) return base;
    const within = share.filter((d) => totalDims.includes(d));
    return `(${base} / NULLIF(SUM(${this.base(index)}) ${this.window(within)}, 0))`;
  }
}

/**
 * Turns a visual's semantic query (dimensions + measures + filters) into one SQL
 * statement. `fromClause` is already quoted/wrapped by the caller.
 */
export function buildSelect(req: QueryRequest, fromClause: string, maxRows: number): BuiltQuery {
  const limit = Math.min(req.limit ?? maxRows, maxRows);
  const whereParams: unknown[] = [];
  const where = buildWhere(req.filters, whereParams);
  const columns: QueryResultColumn[] = [];
  const seen = new Set<string>();

  const uniq = (alias: string): string => {
    let a = alias; let n = 2;
    while (seen.has(a)) a = `${alias}_${n++}`;
    seen.add(a);
    return a;
  };

  const offset = req.offset ? ` OFFSET ${Math.floor(req.offset)}` : '';
  if (req.dimensions.length === 0 && req.measures.length === 0) {
    const sql = `SELECT * FROM ${fromClause}${where} LIMIT ${limit + 1}${offset}`;
    return { sql, params: whereParams, columns: [], limit };
  }

  const selectParams: unknown[] = [];
  const selects: string[] = [];
  for (const d of req.dimensions) {
    const alias = uniq(dimensionAlias(d));
    selects.push(`${dimensionExpr(d)} AS ${quoteIdent(alias)}`);
    columns.push({ alias, role: 'dimension', source: d.field });
  }
  const measureAliases = req.measures.map((m, i) => uniq(measureAlias(m, i)));
  const renderer = new MeasureRenderer(req.measures, measureAliases, req.dimensions, selectParams, req.period?.field);
  req.measures.forEach((m, i) => {
    const alias = measureAliases[i]!;
    selects.push(`${renderer.value(i)} AS ${quoteIdent(alias)}`);
    columns.push({ alias, role: 'measure', source: isFormulaMeasure(m) ? undefined : (m as AggMeasure).field });
  });

  // totals ride along as extra columns (the same on every row of their window) and are lifted out afterwards
  let totals: BuiltTotals | undefined;
  if (req.totals && req.measures.length && req.dimensions.length) {
    totals = { grand: {} };
    const add = (prefix: string, dims: number[], into: Record<string, string>) => {
      req.measures.forEach((_, i) => {
        const alias = measureAliases[i]!;
        const col = uniq(`${prefix}${alias}`);
        selects.push(`${renderer.total(i, dims)} AS ${quoteIdent(col)}`);
        into[alias] = col;
      });
    };
    add('__rs_t_', [], totals.grand);
    if (req.dimensions.length >= 2) {
      totals.byRow = {}; totals.byColumn = {};
      totals.rowDim = columns[0]!.alias; totals.colDim = columns[1]!.alias;
      add('__rs_r_', [0], totals.byRow);
      add('__rs_c_', [1], totals.byColumn);
    }
  }

  // subtotals ride along the same way: one windowed column per measure for every requested set of dimensions
  let subtotals: BuiltSubtotals | undefined;
  if (req.subtotals?.length && req.measures.length && req.dimensions.length) {
    subtotals = { partitions: [], dimAliases: columns.filter((c) => c.role === 'dimension').map((c) => c.alias) };
    const seenKeys = new Set<string>();
    req.subtotals.forEach((raw, pi) => {
      const dims = Array.from(new Set(raw)).filter((i) => i < req.dimensions.length).sort((a, b) => a - b);
      const key = dims.join(',');
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const cols: Record<string, string> = {};
      req.measures.forEach((_, i) => {
        const alias = measureAliases[i]!;
        const col = uniq(`__rs_p${pi}_${alias}`);
        selects.push(`${renderer.total(i, dims)} AS ${quoteIdent(col)}`);
        cols[alias] = col;
      });
      subtotals!.partitions.push({ dims, key, columns: cols });
    });
  }

  const groupBy = req.dimensions.length && req.measures.length
    ? ` GROUP BY ${req.dimensions.map((_, i) => i + 1).join(', ')}`
    : '';
  const distinct = req.dimensions.length && !req.measures.length ? 'DISTINCT ' : '';

  const orderable = new Set(columns.map((c) => c.alias));
  const orderBy = req.orderBy.length
    ? buildOrderBy(req.orderBy, orderable)
    : req.dimensions.length ? ` ORDER BY ${req.dimensions.map((_, i) => i + 1).join(', ')}` : '';

  const sql = `SELECT ${distinct}${selects.join(', ')} FROM ${fromClause}${where}${groupBy}${orderBy} LIMIT ${limit + 1}${offset}`;
  return { sql, params: [...selectParams, ...whereParams], columns, limit, totals, subtotals };
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Lifts the subtotal columns out of the rows. Every row carries its own group's subtotals, so each
 * partition is read once per distinct value tuple (`["Bán buôn","2026-01"]`), and the rows keep only
 * the dimensions and measures.
 */
export function extractSubtotals(rows: Record<string, unknown>[], built: BuiltSubtotals | undefined): { rows: Record<string, unknown>[]; subtotals?: QuerySubtotals } {
  if (!built) return { rows };
  const subtotals: QuerySubtotals = {};
  const extra = new Set<string>();
  for (const p of built.partitions) {
    const byValues: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      const key = JSON.stringify(p.dims.map((i) => text(r[built.dimAliases[i]!])));
      if (!(key in byValues)) byValues[key] = Object.fromEntries(Object.entries(p.columns).map(([alias, col]) => [alias, r[col] ?? null]));
    }
    subtotals[p.key] = byValues;
    for (const col of Object.values(p.columns)) extra.add(col);
  }
  const stripped = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !extra.has(k))));
  return { rows: stripped, subtotals };
}

/** Lifts the totals columns out of the rows: the rows keep only the dimensions and measures, the totals come back keyed by measure alias. */
export function extractTotals(rows: Record<string, unknown>[], built: BuiltTotals | undefined): { rows: Record<string, unknown>[]; totals?: QueryTotals } {
  if (!built) return { rows };
  const totals: QueryTotals = { grand: {} };
  const extra = new Set<string>([...Object.values(built.grand), ...Object.values(built.byRow ?? {}), ...Object.values(built.byColumn ?? {})]);
  const first = rows[0];
  if (first) for (const [alias, col] of Object.entries(built.grand)) totals.grand[alias] = first[col] ?? null;
  if (built.byRow && built.rowDim) {
    totals.byRow = {};
    for (const r of rows) {
      const key = text(r[built.rowDim]);
      if (!(key in totals.byRow)) totals.byRow[key] = Object.fromEntries(Object.entries(built.byRow).map(([alias, col]) => [alias, r[col] ?? null]));
    }
  }
  if (built.byColumn && built.colDim) {
    totals.byColumn = {};
    for (const r of rows) {
      const key = text(r[built.colDim]);
      if (!(key in totals.byColumn)) totals.byColumn[key] = Object.fromEntries(Object.entries(built.byColumn).map(([alias, col]) => [alias, r[col] ?? null]));
    }
  }
  const stripped = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !extra.has(k))));
  return { rows: stripped, totals };
}
