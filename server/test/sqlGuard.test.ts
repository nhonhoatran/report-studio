import { describe, expect, it } from 'vitest';
import { assertReadOnlySelect, stripLiteralsAndComments } from '../src/query/sqlGuard.js';

describe('assertReadOnlySelect', () => {
  it('accepts plain SELECT and CTEs, dropping a trailing semicolon', () => {
    expect(assertReadOnlySelect('SELECT 1;')).toBe('SELECT 1');
    expect(assertReadOnlySelect('with t as (select 1 as a) select * from t')).toMatch(/^with/);
  });
  it('ignores keywords inside strings and comments', () => {
    expect(() => assertReadOnlySelect("SELECT 'drop table x; delete' AS s -- update\n FROM t /* insert */")).not.toThrow();
    expect(stripLiteralsAndComments("select 'a;b' /* ; */ -- ;\n from t")).not.toContain(';');
  });
  it('rejects multiple statements and writes', () => {
    expect(() => assertReadOnlySelect('SELECT 1; DROP TABLE t')).toThrow(/single statement/);
    expect(() => assertReadOnlySelect('DELETE FROM t')).toThrow(/Only SELECT/);
    expect(() => assertReadOnlySelect('SELECT * FROM t INTO OUTFILE "/tmp/x"')).toThrow(/INTO/);
    expect(() => assertReadOnlySelect('SELECT * FROM t FOR UPDATE')).toThrow(/not allowed/);
  });
  it('does not confuse column names with keywords', () => {
    expect(() => assertReadOnlySelect('SELECT created_at, set1, `set` FROM t')).not.toThrow();
  });
});
