import { describe, expect, it } from 'vitest';
import { fieldsFromPackets, kindFromDataType } from '../src/query/introspect.js';
import type { FieldPacket } from 'mysql2/promise';

describe('kindFromDataType', () => {
  it('maps MariaDB column types to field kinds', () => {
    expect(kindFromDataType('int', 'int(11)')).toBe('number');
    expect(kindFromDataType('decimal', 'decimal(10,2)')).toBe('number');
    expect(kindFromDataType('tinyint', 'tinyint(1)')).toBe('boolean');
    expect(kindFromDataType('tinyint', 'tinyint(4)')).toBe('number');
    expect(kindFromDataType('datetime')).toBe('date');
    expect(kindFromDataType('varchar', 'varchar(120)')).toBe('string');
    expect(kindFromDataType('enum', "enum('a','b')")).toBe('string');
    expect(kindFromDataType('blob')).toBe('other');
  });
});

describe('fieldsFromPackets', () => {
  const packet = (name: string, columnType: number, flags = 0, characterSet = 45) =>
    ({ name, columnType, flags, characterSet } as unknown as FieldPacket);
  it('reads kinds, nullability and keys from result packets', () => {
    const fields = fieldsFromPackets([
      packet('id', 3, 1 | 2),        // LONG, NOT_NULL | PRI_KEY
      packet('amount', 246),         // NEWDECIMAL
      packet('created', 12),         // DATETIME
      packet('note', 252, 0, 45),    // BLOB with utf8 charset -> text
      packet('raw', 252, 0, 63),     // BLOB binary
    ]);
    expect(fields.map((f) => [f.name, f.kind, f.nullable, f.isKey])).toEqual([
      ['id', 'number', false, true],
      ['amount', 'number', true, false],
      ['created', 'date', true, false],
      ['note', 'string', true, false],
      ['raw', 'other', true, false],
    ]);
  });
});
