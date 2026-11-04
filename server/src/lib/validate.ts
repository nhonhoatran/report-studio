import type { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest('Validation failed', 'validation_failed', result.error.flatten());
  }
  return result.data as z.output<S>;
}

export function parseId(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id', 'invalid_id');
  return n;
}
