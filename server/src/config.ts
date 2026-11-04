import 'dotenv/config';

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${name}`);
  }
  return v;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: envInt('PORT', 4000),
  host: env('HOST', '0.0.0.0'),
  logLevel: env('LOG_LEVEL', isProd ? 'info' : 'debug'),

  // Secret used to sign sessions and to encrypt data-source passwords at rest.
  appSecret: env('APP_SECRET', isProd ? undefined : 'dev-only-secret-change-me-please-32chars'),
  sessionTtlHours: envInt('SESSION_TTL_HOURS', 12),
  cookieSecure: env('COOKIE_SECURE', isProd ? 'true' : 'false') === 'true',

  // Metadata database (dashboards, users, data-source definitions).
  metaDb: {
    host: env('META_DB_HOST', '127.0.0.1'),
    port: envInt('META_DB_PORT', 3306),
    user: env('META_DB_USER', 'studio'),
    password: env('META_DB_PASSWORD', 'studio_pw'),
    database: env('META_DB_NAME', 'report_studio'),
  },

  // First admin account, created on boot when the users table is empty.
  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', isProd ? undefined : 'admin123'),
  },

  // Guard rails for queries against user data sources.
  query: {
    maxRows: envInt('QUERY_MAX_ROWS', 5000),
    timeoutSeconds: envInt('QUERY_TIMEOUT_SECONDS', 30),
    poolSizePerSource: envInt('QUERY_POOL_SIZE', 4),
  },

  // AI suggestions: how long one provider call may take.
  ai: {
    timeoutSeconds: envInt('AI_TIMEOUT_SECONDS', 60),
  },

  // Directory with the built web app (served in production).
  webDist: env('WEB_DIST', new URL('../../web/dist', import.meta.url).pathname),
};

if (config.appSecret.length < 32) {
  throw new Error('APP_SECRET must be at least 32 characters long');
}
