/*
 * Calculated measures: the expression language a widget's "formula" measure is written in, and
 * the checks both ends run on it. This file is shared with the web client (Vite aliases
 * `@shared/*` to this folder), so it imports nothing and knows nothing about SQL or React: the
 * server turns a parsed formula into SQL in `query/builder.ts`, the editor shows its errors.
 *
 * Grammar (whitespace ignored):
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := '-' factor | primary
 *   primary := number | '(' expr ')' | '[' name ']' | ident '(' (ident | '*') ')' | ident
 * where `[name]` and a bare `ident` refer to another measure of the same widget by alias or
 * display name, and `agg(field)` aggregates a column directly (sum, avg, count, count_distinct,
 * min, max; `count(*)` counts rows).
 */

export const FORMULA_AGGREGATIONS = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'] as const;
export type FormulaAggregation = (typeof FORMULA_AGGREGATIONS)[number];

export const FORMULA_MAX_LENGTH = 2000;
const MAX_DEPTH = 40;

export type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'ref'; name: string; start: number; end: number }
  | { type: 'agg'; agg: FormulaAggregation; field: string; start: number; end: number }
  | { type: 'neg'; arg: FormulaNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

export type FormulaErrorCode =
  | 'empty' | 'too_long' | 'too_deep' | 'bad_number' | 'unexpected_char' | 'unexpected_token' | 'unexpected_end'
  | 'unclosed_paren' | 'unclosed_bracket' | 'unknown_function' | 'bad_argument' | 'unknown_ref' | 'self_ref' | 'cycle';

/** Where (0-based character offset) and why a formula is rejected; `token` is the text at fault when there is one. */
export interface FormulaError { code: FormulaErrorCode; position: number; token?: string }

export type ParseResult = { ok: true; ast: FormulaNode } | { ok: false; error: FormulaError };

type Token =
  | { kind: 'number'; value: number; start: number; end: number }
  | { kind: 'ident'; value: string; start: number; end: number }
  | { kind: 'bracket'; value: string; start: number; end: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' | '×' | '÷'; start: number; end: number }
  | { kind: 'end'; start: number; end: number };

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

function tokenize(src: string): { tokens: Token[] } | { error: FormulaError } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      while (i < src.length && (isDigit(src[i]!) || src[i] === '.')) i++;
      // 1e3 / 2.5E-2
      if ((src[i] === 'e' || src[i] === 'E') && (isDigit(src[i + 1] ?? '') || ((src[i + 1] === '-' || src[i + 1] === '+') && isDigit(src[i + 2] ?? '')))) {
        i += 2;
        while (i < src.length && isDigit(src[i]!)) i++;
      }
      const text = src.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value) || (text.match(/\./g) ?? []).length > 1) return { error: { code: 'bad_number', position: start, token: text } };
      tokens.push({ kind: 'number', value, start, end: i });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i]!)) i++;
      tokens.push({ kind: 'ident', value: src.slice(start, i), start, end: i });
      continue;
    }
    if (c === '[') {
      const close = src.indexOf(']', i + 1);
      if (close < 0) return { error: { code: 'unclosed_bracket', position: i, token: '[' } };
      tokens.push({ kind: 'bracket', value: src.slice(i + 1, close).trim(), start: i, end: close + 1 });
      i = close + 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')' || c === '×' || c === '÷') {
      tokens.push({ kind: 'op', value: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    return { error: { code: 'unexpected_char', position: i, token: c } };
  }
  tokens.push({ kind: 'end', start: src.length, end: src.length });
  return { tokens };
}

class ParseError extends Error { constructor(public readonly err: FormulaError) { super(err.code); } }

/** Parses a formula; the AST is what the server turns into SQL and what the editor checks references against. */
export function parseFormula(src: string): ParseResult {
  if (src.length > FORMULA_MAX_LENGTH) return { ok: false, error: { code: 'too_long', position: FORMULA_MAX_LENGTH } };
  if (!src.trim()) return { ok: false, error: { code: 'empty', position: 0 } };
  const lexed = tokenize(src);
  if ('error' in lexed) return { ok: false, error: lexed.error };
  const tokens = lexed.tokens;
  let pos = 0;
  const peek = () => tokens[pos]!;
  const next = () => tokens[pos++]!;
  const tokenText = (tk: Token) => src.slice(tk.start, tk.end);
  const fail = (code: FormulaErrorCode, tk: Token): never => { throw new ParseError({ code, position: tk.start, token: tk.kind === 'end' ? undefined : tokenText(tk) }); };

  const expr = (depth: number): FormulaNode => {
    let left = term(depth);
    for (;;) {
      const tk = peek();
      if (tk.kind === 'op' && (tk.value === '+' || tk.value === '-')) { next(); left = { type: 'binary', op: tk.value, left, right: term(depth) }; } else return left;
    }
  };
  const term = (depth: number): FormulaNode => {
    let left = factor(depth);
    for (;;) {
      const tk = peek();
      if (tk.kind === 'op' && (tk.value === '*' || tk.value === '/' || tk.value === '×' || tk.value === '÷')) {
        next();
        left = { type: 'binary', op: tk.value === '×' ? '*' : tk.value === '÷' ? '/' : tk.value, left, right: factor(depth) };
      } else return left;
    }
  };
  const factor = (depth: number): FormulaNode => {
    if (depth > MAX_DEPTH) throw new ParseError({ code: 'too_deep', position: peek().start });
    const tk = peek();
    if (tk.kind === 'op' && tk.value === '-') { next(); return { type: 'neg', arg: factor(depth + 1) }; }
    if (tk.kind === 'op' && tk.value === '+') { next(); return factor(depth + 1); }
    return primary(depth);
  };
  const primary = (depth: number): FormulaNode => {
    const tk = next();
    switch (tk.kind) {
      case 'number': return { type: 'number', value: tk.value };
      case 'bracket':
        if (!tk.value) return fail('unexpected_token', tk);
        return { type: 'ref', name: tk.value, start: tk.start, end: tk.end };
      case 'ident': {
        const after = peek();
        if (after.kind === 'op' && after.value === '(') {
          next();
          const agg = tk.value.toLowerCase();
          if (!(FORMULA_AGGREGATIONS as readonly string[]).includes(agg)) return fail('unknown_function', tk);
          const arg = next();
          const field = arg.kind === 'ident' ? arg.value : arg.kind === 'bracket' ? arg.value : arg.kind === 'op' && arg.value === '*' ? '*' : null;
          if (field === null || field === '') return fail('bad_argument', arg);
          if (field === '*' && agg !== 'count') return fail('bad_argument', arg);
          const close = next();
          if (!(close.kind === 'op' && close.value === ')')) return close.kind === 'end' ? fail('unclosed_paren', close) : fail('unexpected_token', close);
          return { type: 'agg', agg: agg as FormulaAggregation, field, start: tk.start, end: close.end };
        }
        return { type: 'ref', name: tk.value, start: tk.start, end: tk.end };
      }
      case 'op':
        if (tk.value === '(') {
          const inner = expr(depth + 1);
          const close = next();
          if (!(close.kind === 'op' && close.value === ')')) return close.kind === 'end' ? fail('unclosed_paren', close) : fail('unexpected_token', close);
          return inner;
        }
        return fail('unexpected_token', tk);
      case 'end':
        return fail('unexpected_end', tk);
    }
  };

  try {
    const ast = expr(0);
    const tail = peek();
    if (tail.kind !== 'end') fail(tail.kind === 'op' && tail.value === ')' ? 'unexpected_token' : 'unexpected_token', tail);
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.err };
    throw e;
  }
}

/** Every `[name]` / bare reference in an AST, in reading order. */
export function formulaRefs(ast: FormulaNode): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = [];
  const walk = (n: FormulaNode): void => {
    switch (n.type) {
      case 'ref': out.push({ name: n.name, start: n.start, end: n.end }); break;
      case 'neg': walk(n.arg); break;
      case 'binary': walk(n.left); walk(n.right); break;
      default: break;
    }
  };
  walk(ast);
  return out;
}

/** What the checks need to know about a widget's measures: how each can be named, and which are formulas. */
export interface MeasureRef { alias: string; label?: string; formula?: string }

const norm = (s: string) => s.trim().toLowerCase();

/** The measure a reference names: by alias first, then by display name (both case-insensitive). */
export function resolveRef(name: string, measures: MeasureRef[]): MeasureRef | undefined {
  const n = norm(name);
  return measures.find((m) => norm(m.alias) === n) ?? measures.find((m) => m.label !== undefined && norm(m.label) === n);
}

/**
 * Checks one formula measure against its widget: it must parse, every reference must name
 * another measure, and following references through other formulas must not come back to it.
 * Returns the AST when valid, so callers do not parse twice.
 */
export function checkFormula(self: MeasureRef, measures: MeasureRef[]): { ok: true; ast: FormulaNode } | { ok: false; error: FormulaError } {
  const parsed = parseFormula(self.formula ?? '');
  if (!parsed.ok) return parsed;
  const err = checkRefs(parsed.ast, self, measures, [self.alias]);
  return err ? { ok: false, error: err } : parsed;
}

function checkRefs(ast: FormulaNode, self: MeasureRef, measures: MeasureRef[], trail: string[]): FormulaError | null {
  for (const r of formulaRefs(ast)) {
    const target = resolveRef(r.name, measures);
    if (!target) return { code: 'unknown_ref', position: r.start, token: r.name };
    if (target.alias === self.alias) return { code: 'self_ref', position: r.start, token: r.name };
    if (target.formula !== undefined) {
      if (trail.includes(target.alias)) return { code: 'cycle', position: r.start, token: r.name };
      const inner = parseFormula(target.formula);
      // the other formula's own syntax is reported on that measure; here only the reference chain matters
      if (!inner.ok) continue;
      const deeper = checkRefs(inner.ast, self, measures, [...trail, target.alias]);
      if (deeper) return { code: deeper.code === 'cycle' || deeper.code === 'self_ref' ? 'cycle' : deeper.code, position: r.start, token: r.name };
    }
  }
  return null;
}
