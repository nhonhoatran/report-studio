import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { migrations } from './migrations.js';

export const metaPool: Pool = mysql.createPool({
  host: config.metaDb.host,
  port: config.metaDb.port,
  user: config.metaDb.user,
  password: config.metaDb.password,
  database: config.metaDb.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  namedPlaceholders: false,
});

export type Row = RowDataPacket;
export type Param = string | number | boolean | null | Date | Buffer;

export async function query<T extends Row = Row>(sql: string, params: Param[] = []): Promise<T[]> {
  const [rows] = await metaPool.query<T[]>(sql, params);
  return rows;
}

export async function queryOne<T extends Row = Row>(sql: string, params: Param[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: Param[] = []): Promise<ResultSetHeader> {
  const [result] = await metaPool.execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await metaPool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function waitForDatabase(attempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await metaPool.query('SELECT 1');
      return;
    } catch (err) {
      logger.warn({ attempt: i, err: (err as Error).message }, 'metadata database not reachable yet');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Metadata database did not become reachable');
}

export async function migrate(): Promise<void> {
  await waitForDatabase();
  await metaPool.query(migrations[0]!.sql[0]!); // schema_migrations table first
  const applied = new Set(
    (await query<Row & { version: number }>('SELECT version FROM schema_migrations')).map((r) => Number(r.version)),
  );
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    logger.info({ version: m.version, name: m.name }, 'applying migration');
    for (const statement of m.sql) {
      await metaPool.query(statement);
    }
    await execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
  }
}

export async function seedAdmin(): Promise<void> {
  const existing = await queryOne<Row & { c: number }>('SELECT COUNT(*) AS c FROM users');
  if (existing && Number(existing.c) > 0) return;
  const hash = await bcrypt.hash(config.admin.password, 10);
  await execute(
    'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
    [config.admin.username, 'Administrator', hash, 'admin'],
  );
  logger.warn({ username: config.admin.username }, 'created initial admin account; change its password');
}
