import mysql, { type FieldPacket, type Pool, type RowDataPacket } from 'mysql2/promise';
import type { Connection as RawConnection } from 'mysql2';
import { config } from '../config.js';
import { decrypt } from '../lib/crypto.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { DatasourceRow } from '../routes/datasources.js';

interface CachedPool { pool: Pool; version: string }
const pools = new Map<number, CachedPool>();

export interface SourceConnection {
  host: string; port: number; user: string; password: string; database: string; ssl: boolean;
}

export function connectionFromRow(row: DatasourceRow): SourceConnection {
  return {
    host: row.host,
    port: Number(row.port),
    user: row.username,
    password: decrypt(row.password_enc),
    database: row.database_name,
    ssl: Boolean(Number(row.use_ssl)),
  };
}

function createPool(conn: SourceConnection, connectionLimit: number): Pool {
  const pool = mysql.createPool({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 50,
    connectTimeout: 10_000,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    multipleStatements: false,
  });
  // Every physical connection is forced read-only and time-boxed. The event hands over the
  // raw callback-style connection; mysql2 queues commands per connection, so these run
  // before any user query on the same connection.
  pool.on('connection', (raw) => {
    const c = raw as unknown as RawConnection;
    c.query('SET SESSION TRANSACTION READ ONLY', (err: Error | null) => {
      if (err) logger.warn({ err: err.message }, 'could not set READ ONLY on data-source connection');
    });
    c.query(`SET SESSION max_statement_time=${config.query.timeoutSeconds}`, () => {
      /* MySQL (non-MariaDB) does not know max_statement_time; the client-side timeout still applies. */
    });
  });
  return pool;
}

/** Pool for a saved data source. Recreated when the row's updated_at changes. */
export function poolForDatasource(row: DatasourceRow): Pool {
  const version = String(row.updated_at);
  const cached = pools.get(row.id);
  if (cached && cached.version === version) return cached.pool;
  if (cached) void cached.pool.end().catch(() => undefined);
  const pool = createPool(connectionFromRow(row), config.query.poolSizePerSource);
  pools.set(row.id, { pool, version });
  return pool;
}

export function dropPool(datasourceId: number): void {
  const cached = pools.get(datasourceId);
  if (cached) {
    pools.delete(datasourceId);
    void cached.pool.end().catch(() => undefined);
  }
}

export async function closeAllPools(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.pool.end().catch(() => undefined)));
  pools.clear();
}

/** One-off connectivity test for a connection that is not saved yet. */
export async function testConnection(conn: SourceConnection): Promise<{ version: string; latencyMs: number }> {
  const started = Date.now();
  const single = await mysql.createConnection({
    host: conn.host, port: conn.port, user: conn.user, password: conn.password, database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 8_000,
  });
  try {
    const [rows] = await single.query<RowDataPacket[]>('SELECT VERSION() AS v');
    return { version: String(rows[0]?.v ?? 'unknown'), latencyMs: Date.now() - started };
  } finally {
    await single.end();
  }
}

export interface RunResult { rows: RowDataPacket[]; fields: FieldPacket[]; durationMs: number }

export async function runOnPool(pool: Pool, sql: string, params: unknown[] = []): Promise<RunResult> {
  const started = Date.now();
  try {
    const [rows, fields] = await pool.query<RowDataPacket[]>({
      sql, values: params, timeout: config.query.timeoutSeconds * 1000,
    });
    return { rows, fields, durationMs: Date.now() - started };
  } catch (err) {
    throw translateDbError(err);
  }
}

export function translateDbError(err: unknown): Error {
  const e = err as { code?: string; sqlMessage?: string; message?: string; errno?: number };
  const message = e.sqlMessage ?? e.message ?? 'Database error';
  switch (e.code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return new HttpError(502, `Access denied by data source: ${message}`);
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'PROTOCOL_CONNECTION_LOST':
      return new HttpError(502, `Cannot reach data source: ${message}`);
    case 'PROTOCOL_SEQUENCE_TIMEOUT':
    case 'ER_STATEMENT_TIMEOUT':
      return new HttpError(504, `Query timed out after ${config.query.timeoutSeconds}s`);
    case 'ER_OPTION_PREVENTS_STATEMENT':
      return new HttpError(400, 'Connection is read-only; write statements are blocked');
    default:
      if (e.sqlMessage || (e.errno && e.errno >= 1000)) return badRequest(`SQL error: ${message}`);
      return err instanceof Error ? err : new Error(message);
  }
}
