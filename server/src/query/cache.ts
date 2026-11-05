import { createHash } from 'node:crypto';
import { config } from '../config.js';
import type { QueryResult } from './types.js';

/*
 * The result cache: one entry per (data source, SQL, parameters). The row filters a user's access
 * policies add are part of the SQL and its parameters, so two users with different row-level
 * security never share an entry; so are the dashboard's filters. Entries live for the data
 * source's TTL and the cache holds at most `maxEntries` (the oldest go first).
 */

export interface CacheEntry<T> { value: T; storedAt: number; expiresAt: number }

export class ResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  constructor(private readonly maxEntries: number) {}

  static key(datasourceId: number, sql: string, params: unknown[]): string {
    return createHash('sha256').update(`${datasourceId}\n${sql}\n${JSON.stringify(params)}`).digest('hex');
  }

  get(key: string, now = Date.now()): CacheEntry<T> | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) { this.entries.delete(key); return undefined; }
    return e;
  }

  set(key: string, value: T, ttlSeconds: number, now = Date.now()): void {
    if (ttlSeconds <= 0 || this.maxEntries <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now, expiresAt: now + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Forget everything (a data source changed; its entries cannot be told apart cheaply, and a cold cache is harmless). */
  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

/** Results by SQL + parameters, for the data sources that set a TTL (or the server default). */
export const resultCache = new ResultCache<QueryResult>(config.query.cacheMaxEntries);
