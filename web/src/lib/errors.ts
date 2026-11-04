import { ApiError } from '@/api/client';
import { hasTranslation, type TFn, type TKey, type TParams } from '@/i18n';

/** Scalar members of a server `details` object become template parameters (`{keyword}`, `{seconds}`…). */
function paramsFrom(details: unknown): TParams | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const out: TParams = {};
  for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Translate a server error code when the dictionary knows it; otherwise the English message. */
export function describeServerError(err: { code?: string; message?: string; details?: unknown }, t: TFn): string {
  const key = err.code ? `errors.${err.code}` : '';
  if (key && hasTranslation(key)) return t(key as TKey, paramsFrom(err.details));
  return err.message ?? t('common.errorGeneric');
}

/** One text for anything thrown: an ApiError (translated by code), an Error, a string. */
export function describeError(err: unknown, t: TFn): string {
  if (err instanceof ApiError) return describeServerError({ code: err.code, message: err.message, details: err.details }, t);
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return t('common.errorGeneric');
}
