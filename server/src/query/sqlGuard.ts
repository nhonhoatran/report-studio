import { badRequest } from '../lib/errors.js';

const FORBIDDEN = [
  'insert', 'update', 'delete', 'replace', 'merge', 'drop', 'alter', 'create', 'truncate', 'rename',
  'grant', 'revoke', 'load', 'call', 'handler', 'lock', 'unlock', 'set', 'use', 'into', 'outfile',
  'dumpfile', 'shutdown', 'kill', 'install', 'uninstall', 'flush', 'reset', 'purge', 'start', 'commit',
  'rollback', 'savepoint', 'prepare', 'execute', 'deallocate', 'xa', 'begin', 'do', 'analyze', 'optimize',
  'repair', 'check', 'backup', 'restore', 'signal', 'resignal', 'get',
];

/** Remove comments and string literals so keyword scanning cannot be fooled. */
export function stripLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    if ((ch === '-' && next === '-') || ch === '#') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += `${quote}${quote}`;
      i = j + 1;
      continue;
    }
    if (ch === '`') {
      const end = sql.indexOf('`', i + 1);
      out += '`x`';
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Accepts a single read-only SELECT (or WITH ... SELECT) statement and returns it
 * normalised (trailing semicolon removed). Throws a 400 otherwise.
 *
 * This is defence in depth: the data-source account should also be read-only and the
 * connection is opened with READ ONLY transactions.
 */
export function assertReadOnlySelect(rawSql: string): string {
  let sql = rawSql.trim();
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trimEnd();
  if (!sql) throw badRequest('SQL is empty', 'sql_empty');

  const scan = stripLiteralsAndComments(sql);
  if (scan.includes(';')) throw badRequest('Only a single statement is allowed', 'sql_multiple_statements');

  const firstWord = scan.trimStart().split(/\s+/)[0]?.toLowerCase();
  if (firstWord !== 'select' && firstWord !== 'with') {
    throw badRequest('Only SELECT statements are allowed', 'sql_not_select');
  }

  const tokens = scan.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
  const hit = tokens.find((t) => FORBIDDEN.includes(t));
  if (hit) throw badRequest(`Keyword "${hit.toUpperCase()}" is not allowed in a read-only query`, 'sql_keyword_blocked', { keyword: hit.toUpperCase() });

  if (/\bfor\s+update\b/i.test(scan) || /\block\s+in\s+share\s+mode\b/i.test(scan)) {
    throw badRequest('Locking reads are not allowed', 'sql_locking');
  }
  return sql;
}
