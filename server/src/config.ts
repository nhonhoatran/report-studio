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

function envList(name: string): string[] {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const ROLES = ['admin', 'editor', 'viewer'] as const;
function envRole(name: string, fallback: (typeof ROLES)[number]): (typeof ROLES)[number] {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  if (!(ROLES as readonly string[]).includes(v)) throw new Error(`Environment variable ${name} must be one of ${ROLES.join(', ')}`);
  return v as (typeof ROLES)[number];
}

const isProd = process.env.NODE_ENV === 'production';
const entraTenantId = env('ENTRA_TENANT_ID', '');
const entraClientId = env('ENTRA_CLIENT_ID', '');
const entraClientSecret = env('ENTRA_CLIENT_SECRET', '');

export const config = {
  isProd,
  port: envInt('PORT', 4000),
  host: env('HOST', '0.0.0.0'),
  logLevel: env('LOG_LEVEL', isProd ? 'info' : 'debug'),

  // Secret used to sign sessions and to encrypt data-source passwords at rest.
  appSecret: env('APP_SECRET', isProd ? undefined : 'dev-only-secret-change-me-please-32chars'),
  sessionTtlHours: envInt('SESSION_TTL_HOURS', 12),
  cookieSecure: env('COOKIE_SECURE', isProd ? 'true' : 'false') === 'true',

  // Sign-in methods. Password login can be switched off once Entra works.
  auth: {
    localLogin: env('AUTH_LOCAL_LOGIN', 'true') === 'true',
  },

  // Microsoft Entra ID (OpenID Connect, authorization code + PKCE). Enabled when the
  // three identifiers are set; the app registration needs a web redirect URI pointing
  // at /api/auth/entra/callback.
  entra: {
    enabled: Boolean(entraTenantId && entraClientId && entraClientSecret),
    tenantId: entraTenantId,
    clientId: entraClientId,
    clientSecret: entraClientSecret,
    authority: env('ENTRA_AUTHORITY', 'https://login.microsoftonline.com').replace(/\/+$/, ''),
    // Public URL of the callback; derived from the request when empty.
    redirectUri: env('ENTRA_REDIRECT_URI', ''),
    // Only accept accounts whose e-mail / UPN domain is listed (empty = any).
    allowedDomains: envList('ENTRA_ALLOWED_DOMAINS').map((d) => d.toLowerCase()),
    // Create a local account on first sign-in; otherwise only pre-created accounts may sign in.
    autoProvision: env('ENTRA_AUTO_PROVISION', 'true') === 'true',
    defaultRole: envRole('ENTRA_DEFAULT_ROLE', 'viewer'),
    // App role values (or group object ids) from the token's `roles` / `groups` claims.
    roles: {
      admin: envList('ENTRA_ADMIN_ROLES'),
      editor: envList('ENTRA_EDITOR_ROLES'),
      viewer: envList('ENTRA_VIEWER_ROLES'),
    },
  },

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
if ((entraTenantId || entraClientId || entraClientSecret) && !config.entra.enabled) {
  throw new Error('ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET must all be set to enable Microsoft Entra sign-in');
}
if (!config.auth.localLogin && !config.entra.enabled) {
  throw new Error('AUTH_LOCAL_LOGIN=false requires Microsoft Entra sign-in to be configured');
}
