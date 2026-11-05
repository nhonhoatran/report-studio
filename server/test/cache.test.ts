import { describe, expect, it } from 'vitest';
import { ResultCache } from '../src/query/cache.js';

describe('ResultCache', () => {
  it('keys by data source, SQL and parameters, so another user\'s row filters never share an entry', () => {
    const a = ResultCache.key(1, 'SELECT 1 WHERE r IN (?)', ['north']);
    const b = ResultCache.key(1, 'SELECT 1 WHERE r IN (?)', ['south']);
    const c = ResultCache.key(2, 'SELECT 1 WHERE r IN (?)', ['north']);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(ResultCache.key(1, 'SELECT 1 WHERE r IN (?)', ['north'])).toBe(a);
  });
  it('serves within the TTL and forgets after it', () => {
    const cache = new ResultCache<number>(10);
    cache.set('k', 42, 60, 1000);
    expect(cache.get('k', 1000 + 59_000)?.value).toBe(42);
    expect(cache.get('k', 1000 + 60_000)).toBeUndefined();
  });
  it('stores nothing with a zero TTL and evicts the oldest beyond its size', () => {
    const cache = new ResultCache<number>(2);
    cache.set('a', 1, 0);
    expect(cache.size).toBe(0);
    cache.set('a', 1, 60); cache.set('b', 2, 60); cache.set('c', 3, 60);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')?.value).toBe(3);
  });
});
