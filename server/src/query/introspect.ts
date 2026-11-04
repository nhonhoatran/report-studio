import type { FieldPacket, Pool, RowDataPacket } from 'mysql2/promise';
import { assertReadOnlySelect } from './sqlGuard.js';
import { runOnPool } from './executor.js';
import type { FieldInfo, FieldKind } from './types.js';

export interface TableInfo {
  name: string;
  type: 'table' | 'view';
  rows: number | null;
  comment: string;
}

export async function listTables(pool: Pool): Promise<TableInfo[]> {
  const { rows } = await runOnPool(pool,
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS rows_est, TABLE_COMMENT AS comment
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME`);
  return rows.map((r) => ({
    name: String(r.name),
    type: String(r.type).toUpperCase() === 'VIEW' ? 'view' : 'table',
    rows: r.rows_est === null || r.rows_est === undefined ? null : Number(r.rows_est),
    comment: String(r.comment ?? ''),
  }));
}

export function kindFromDataType(dataType: string, columnType = ''): FieldKind {
  const t = dataType.toLowerCase();
  if (t === 'tinyint' && /tinyint\(1\)/i.test(columnType)) return 'boolean';
  if (['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric', 'float', 'double', 'real', 'bit'].includes(t)) return 'number';
  if (['date', 'datetime', 'timestamp', 'time', 'year'].includes(t)) return 'date';
  if (['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext', 'enum', 'set', 'json', 'uuid', 'inet6', 'inet4'].includes(t)) return 'string';
  if (t === 'boolean') return 'boolean';
  return 'other';
}

export async function listColumns(pool: Pool, table: string): Promise<FieldInfo[]> {
  const { rows } = await runOnPool(pool,
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type, COLUMN_TYPE AS column_type,
            IS_NULLABLE AS nullable, COLUMN_KEY AS col_key, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`, [table]);
  return rows.map((r) => ({
    name: String(r.name),
    dataType: String(r.column_type),
    kind: kindFromDataType(String(r.data_type), String(r.column_type)),
    nullable: String(r.nullable).toUpperCase() === 'YES',
    isKey: String(r.col_key ?? '') !== '',
    comment: r.comment ? String(r.comment) : undefined,
  }));
}

// MySQL protocol type codes -> field kind. See mysql2 Types.
const TYPE_KIND: Record<number, FieldKind> = {
  0: 'number', 1: 'number', 2: 'number', 3: 'number', 4: 'number', 5: 'number', 8: 'number', 9: 'number', 16: 'number', 246: 'number',
  7: 'date', 10: 'date', 11: 'date', 12: 'date', 13: 'date', 14: 'date',
  15: 'string', 245: 'string', 247: 'string', 248: 'string', 253: 'string', 254: 'string',
  249: 'other', 250: 'other', 251: 'other', 252: 'other', 255: 'other',
};
const TYPE_NAME: Record<number, string> = {
  0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float', 5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint',
  10: 'date', 11: 'time', 12: 'datetime', 13: 'year', 15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal', 247: 'enum',
  248: 'set', 249: 'tinyblob', 250: 'mediumblob', 251: 'longblob', 252: 'blob', 253: 'varchar', 254: 'char', 255: 'geometry',
};

export function fieldsFromPackets(fields: FieldPacket[]): FieldInfo[] {
  return fields.map((f) => {
    const code = (f as unknown as { columnType?: number; type?: number }).columnType
      ?? (f as unknown as { type?: number }).type ?? 253;
    // text columns come back as BLOB types with a text charset (not 63 = binary)
    const isTextBlob = [249, 250, 251, 252].includes(code) && (f as unknown as { characterSet?: number }).characterSet !== 63;
    const kind: FieldKind = isTextBlob ? 'string' : (TYPE_KIND[code] ?? 'other');
    const flags = (f as unknown as { flags?: number }).flags ?? 0;
    return {
      name: f.name,
      dataType: isTextBlob ? 'text' : (TYPE_NAME[code] ?? 'unknown'),
      kind,
      nullable: (flags & 1) === 0,
      isKey: (flags & 2) !== 0,
    };
  });
}

/** Resolve the output columns of a SQL dataset without reading rows. */
export async function describeSql(pool: Pool, sql: string): Promise<FieldInfo[]> {
  const safe = assertReadOnlySelect(sql);
  const { fields } = await runOnPool(pool, `SELECT * FROM (${safe}) AS \`__rs_src\` LIMIT 0`);
  return fieldsFromPackets(fields);
}

export type { RowDataPacket };
