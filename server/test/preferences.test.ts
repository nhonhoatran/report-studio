import { describe, expect, it } from 'vitest';
import { MAX_PREFERENCES_BYTES, parsePreferencesColumn, preferencesSchema, serializePreferences } from '../src/auth/preferences.js';

describe('preferencesSchema', () => {
  it('accepts a flat bag of small scalars', () => {
    const out = preferencesSchema.parse({ theme: 'dark', accent: 'sea', text: 'lg', compact: false, version: 1 });
    expect(out).toEqual({ theme: 'dark', accent: 'sea', text: 'lg', compact: false, version: 1 });
  });
  it('rejects nested values, long strings and odd keys', () => {
    expect(preferencesSchema.safeParse({ nested: { a: 1 } }).success).toBe(false);
    expect(preferencesSchema.safeParse({ list: ['a'] }).success).toBe(false);
    expect(preferencesSchema.safeParse({ s: 'x'.repeat(61) }).success).toBe(false);
    expect(preferencesSchema.safeParse({ 'bad key': 'x' }).success).toBe(false);
    expect(preferencesSchema.safeParse({ '1leading': 'x' }).success).toBe(false);
  });
  it('caps the number of keys', () => {
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 'v']));
    expect(preferencesSchema.safeParse(many).success).toBe(false);
  });
});

describe('parsePreferencesColumn', () => {
  it('round-trips through serializePreferences', () => {
    const prefs = { theme: 'system', accent: 'rose', palette: 'vivid', lang: 'en' };
    expect(parsePreferencesColumn(serializePreferences(prefs))).toEqual(prefs);
  });
  it('treats NULL, invalid JSON and wrong shapes as empty', () => {
    expect(parsePreferencesColumn(null)).toEqual({});
    expect(parsePreferencesColumn(undefined)).toEqual({});
    expect(parsePreferencesColumn('')).toEqual({});
    expect(parsePreferencesColumn('{not json')).toEqual({});
    expect(parsePreferencesColumn('[1,2]')).toEqual({});
    expect(parsePreferencesColumn('{"a":{"b":1}}')).toEqual({});
  });
});

describe('serializePreferences', () => {
  it('rejects an oversized bag with a 400 (multi-byte values pass the per-key caps but not the byte cap)', () => {
    const big = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`key_${i}`, '漢'.repeat(60)]));
    expect(preferencesSchema.safeParse(big).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(big), 'utf8')).toBeGreaterThan(MAX_PREFERENCES_BYTES);
    expect(() => serializePreferences(big)).toThrow(/exceed/);
  });
  it('keeps an ordinary bag', () => {
    expect(serializePreferences({ theme: 'dark', lang: 'vi' })).toBe('{"theme":"dark","lang":"vi"}');
  });
});
