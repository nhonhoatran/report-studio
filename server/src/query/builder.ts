import { badRequest } from '../lib/errors.js';
import type { Dimension, Filter, Measure, OrderBy, QueryRequest, QueryResultColumn } from './types.js';

export interface BuiltQuery {
  sql: string;
  params: unknown[];
  columns: QueryResultColumn[];
  limit: number;
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
  const col = quoteIdent(d.field);
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

function measureExpr(m: Measure): string {
  const col = m.field === '*' ? '*' : quoteIdent(m.field);
  switch (m.agg) {
    case 'sum': return `SUM(${col})`;
    case 'avg': return `AVG(${col})`;
    case 'min': return `MIN(${col})`;
    case 'max': return `MAX(${col})`;
    case 'count': return `COUNT(${col})`;
    case 'count_distinct':
      if (m.field === '*') throw badRequest('count_distinct needs a field', 'count_distinct_needs_field');
      return `COUNT(DISTINCT ${col})`;
  }
}

function measureAlias(m: Measure): string {
  if (m.alias) return safeAlias(m.alias);
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

/**
 * Turns a visual's semantic query (dimensions + measures + filters) into one SQL
 * statement. `fromClause` is already quoted/wrapped by the caller.
 */
export function buildSelect(req: QueryRequest, fromClause: string, maxRows: number): BuiltQuery {
  const params: unknown[] = [];
  const limit = Math.min(req.limit ?? maxRows, maxRows);
  const where = buildWhere(req.filters, params);
  const columns: QueryResultColumn[] = [];
  const seen = new Set<string>();

  const uniq = (alias: string): string => {
    let a = alias; let n = 2;
    while (seen.has(a)) a = `${alias}_${n++}`;
    seen.add(a);
    return a;
  };

  if (req.dimensions.length === 0 && req.measures.length === 0) {
    const sql = `SELECT * FROM ${fromClause}${where} LIMIT ${limit + 1}`;
    return { sql, params, columns: [], limit };
  }

  const selects: string[] = [];
  for (const d of req.dimensions) {
    const alias = uniq(dimensionAlias(d));
    selects.push(`${dimensionExpr(d)} AS ${quoteIdent(alias)}`);
    columns.push({ alias, role: 'dimension', source: d.field });
  }
  for (const m of req.measures) {
    const alias = uniq(measureAlias(m));
    selects.push(`${measureExpr(m)} AS ${quoteIdent(alias)}`);
    columns.push({ alias, role: 'measure', source: m.field });
  }

  const groupBy = req.dimensions.length && req.measures.length
    ? ` GROUP BY ${req.dimensions.map((_, i) => i + 1).join(', ')}`
    : '';
  const distinct = req.dimensions.length && !req.measures.length ? 'DISTINCT ' : '';

  const orderBy = req.orderBy.length
    ? buildOrderBy(req.orderBy, seen)
    : req.dimensions.length ? ` ORDER BY ${req.dimensions.map((_, i) => i + 1).join(', ')}` : '';

  const sql = `SELECT ${distinct}${selects.join(', ')} FROM ${fromClause}${where}${groupBy}${orderBy} LIMIT ${limit + 1}`;
  return { sql, params, columns, limit };
}
