/**
 * Stable, machine-readable error codes. The web client translates a known code into the
 * user's language and falls back to `message` (English) for anything else. Add a key under
 * `errors.<code>` in both web dictionaries when adding a code here.
 */
export type ErrorCode =
  | 'unauthorized' | 'forbidden' | 'not_found' | 'validation_failed' | 'invalid_id' | 'malformed_json' | 'internal'
  | 'invalid_credentials' | 'password_incorrect' | 'username_exists' | 'user_not_found' | 'cannot_delete_self'
  | 'local_login_disabled' | 'account_has_no_password' | 'preferences_too_large'
  | 'permission_denied' | 'access_denied' | 'invalid_role' | 'role_not_found' | 'role_name_exists' | 'role_in_use' | 'role_builtin'
  | 'policy_not_found' | 'policy_invalid' | 'last_admin' | 'source_not_in_dashboard'
  | 'dashboard_not_found'
  | 'dataset_not_found' | 'dataset_name_exists' | 'dataset_wrong_datasource' | 'adhoc_sql_forbidden'
  | 'datasource_not_found' | 'datasource_name_exists' | 'table_not_found'
  | 'invalid_identifier' | 'invalid_table' | 'count_distinct_needs_field' | 'between_needs_two_values' | 'order_by_unknown'
  | 'sql_empty' | 'sql_multiple_statements' | 'sql_not_select' | 'sql_keyword_blocked' | 'sql_locking'
  | 'db_access_denied' | 'db_unreachable' | 'db_timeout' | 'db_read_only' | 'db_sql_error'
  | 'ai_provider_not_found' | 'ai_provider_name_exists' | 'ai_no_provider' | 'ai_auth_failed' | 'ai_provider_error'
  | 'ai_timeout' | 'ai_bad_response' | 'ai_needs_fields';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: ErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code?: ErrorCode, details?: unknown) => new HttpError(400, message, code, details);
export const unauthorized = (message = 'Unauthorized', code: ErrorCode = 'unauthorized') => new HttpError(401, message, code);
export const forbidden = (message = 'Forbidden', code: ErrorCode = 'forbidden', details?: unknown) => new HttpError(403, message, code, details);
export const notFound = (message = 'Not found', code: ErrorCode = 'not_found') => new HttpError(404, message, code);
export const conflict = (message: string, code?: ErrorCode) => new HttpError(409, message, code);
