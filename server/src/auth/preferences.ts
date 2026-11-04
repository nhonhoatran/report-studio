import { z } from 'zod';
import { badRequest } from '../lib/errors.js';

/**
 * Per-user UI preferences. The web client owns the shape (which keys exist and what
 * values they take), so the server only enforces a flat bag of small scalars and a
 * size cap, the way dashboards.definition is handled.
 */
export const MAX_PREFERENCES_BYTES = 4096;
export const MAX_PREFERENCE_KEYS = 32;

const keySchema = z.string().min(1).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'preference keys are identifiers');
const valueSchema = z.union([z.string().max(60), z.number().finite(), z.boolean()]);

export const preferencesSchema = z
  .record(keySchema, valueSchema)
  .refine((o) => Object.keys(o).length <= MAX_PREFERENCE_KEYS, { message: `at most ${MAX_PREFERENCE_KEYS} preferences` });

export type Preferences = z.infer<typeof preferencesSchema>;

/** Column value -> preferences. Anything unreadable (NULL, bad JSON, wrong shape) is an empty bag. */
export function parsePreferencesColumn(raw: string | null | undefined): Preferences {
  if (!raw) return {};
  try {
    const parsed = preferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Validated preferences -> column value, rejecting an oversized bag with a 400. */
export function serializePreferences(prefs: Preferences): string {
  const json = JSON.stringify(prefs);
  if (Buffer.byteLength(json, 'utf8') > MAX_PREFERENCES_BYTES) {
    throw badRequest(`Preferences exceed ${MAX_PREFERENCES_BYTES} bytes`);
  }
  return json;
}
