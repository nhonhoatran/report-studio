/**
 * End-to-end test of the Microsoft Entra sign-in against a fake identity provider:
 * discovery → redirect with PKCE → callback → code exchange → ID token verification →
 * account provisioning / linking → session cookie. The metadata database is replaced by
 * an in-memory users table.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';

// ---------- in-memory metadata database ----------
interface U { id: number; username: string; display_name: string; password_hash: string | null; role: string; auth_provider: string; external_id: string | null; email: string | null; created_at: string }
const users: U[] = [];
let nextId = 1;
const lower = (v: string | null) => (v ?? '').toLowerCase();

function fakeQuery(sql: string, params: unknown[] = []): unknown[] {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('SELECT * FROM users WHERE auth_provider = ? AND external_id = ?')) {
    return users.filter((u) => u.auth_provider === params[0] && u.external_id === params[1]);
  }
  if (s.startsWith('SELECT * FROM users WHERE external_id IS NULL AND (LOWER(username) IN (')) {
    const n = params.length / 2;
    const names = params.slice(0, n) as string[];
    return users.filter((u) => u.external_id === null && (names.includes(lower(u.username)) || names.includes(lower(u.email)))).sort((a, b) => a.id - b.id).slice(0, 1);
  }
  if (s.startsWith('SELECT id FROM users WHERE username = ?')) return users.filter((u) => u.username === params[0]).map((u) => ({ id: u.id }));
  if (s.startsWith('SELECT * FROM users WHERE id = ?')) return users.filter((u) => u.id === Number(params[0]));
  if (s.startsWith('SELECT * FROM users WHERE username = ?')) return users.filter((u) => u.username === params[0]);
  throw new Error(`fake db: unexpected query ${s}`);
}
function fakeExecute(sql: string, params: unknown[] = []): { insertId: number; affectedRows: number } {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('INSERT INTO users (username, display_name, password_hash, role, auth_provider, external_id, email) VALUES (?, ?, NULL, ?, ?, ?, ?)')) {
    const [username, display_name, role, auth_provider, external_id, email] = params as [string, string, string, string, string, string | null];
    users.push({ id: nextId, username, display_name, password_hash: null, role, auth_provider, external_id, email, created_at: '2026-01-01 00:00:00' });
    return { insertId: nextId++, affectedRows: 1 };
  }
  if (s.startsWith('UPDATE users SET auth_provider = ?, external_id = ?, email = COALESCE(email, ?) WHERE id = ?')) {
    const u = users.find((x) => x.id === Number(params[3]))!;
    u.auth_provider = params[0] as string; u.external_id = params[1] as string; u.email = u.email ?? (params[2] as string | null);
    return { insertId: 0, affectedRows: 1 };
  }
  if (s.startsWith('UPDATE users SET display_name = ?, role = ?, email = ? WHERE id = ?')) {
    const u = users.find((x) => x.id === Number(params[3]))!;
    u.display_name = params[0] as string; u.role = params[1] as string; u.email = params[2] as string | null;
    return { insertId: 0, affectedRows: 1 };
  }
  throw new Error(`fake db: unexpected statement ${s}`);
}
vi.mock('../src/db/metadata.js', () => ({
  metaPool: {},
  query: async (sql: string, params?: unknown[]) => fakeQuery(sql, params),
  queryOne: async (sql: string, params?: unknown[]) => fakeQuery(sql, params)[0] ?? null,
  execute: async (sql: string, params?: unknown[]) => fakeExecute(sql, params),
  withTransaction: async () => { throw new Error('not used'); },
  migrate: async () => {},
  seedAdmin: async () => {},
}));

// ---------- fake Microsoft Entra ----------
const TENANT = 'tenant-1';
const CLIENT_ID = 'client-123';
const CLIENT_SECRET = 'secret-xyz';
let idp: Server; let idpBase: string;
let privateKey: KeyLike; let jwk: Record<string, unknown>;
const tokenRequests: URLSearchParams[] = [];
let nextClaims: Record<string, unknown> = {};
let nextTokenStatus = 200;

async function mintIdToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT({ tid: TENANT, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`${idpBase}/${TENANT}/v2.0`).setAudience(CLIENT_ID).setIssuedAt().setExpirationTime('5m')
    .sign(privateKey);
}

let app: Server; let appBase: string;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };

  idp = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === `/${TENANT}/v2.0/.well-known/openid-configuration`) {
      return json(200, { issuer: `${idpBase}/{tenantid}/v2.0`, authorization_endpoint: `${idpBase}/${TENANT}/oauth2/v2.0/authorize`, token_endpoint: `${idpBase}/${TENANT}/oauth2/v2.0/token`, jwks_uri: `${idpBase}/${TENANT}/discovery/v2.0/keys` });
    }
    if (url.pathname === `/${TENANT}/discovery/v2.0/keys`) return json(200, { keys: [jwk] });
    if (url.pathname === `/${TENANT}/oauth2/v2.0/token`) {
      let body = ''; for await (const c of req) body += c;
      const form = new URLSearchParams(body);
      tokenRequests.push(form);
      if (nextTokenStatus !== 200) return json(nextTokenStatus, { error: 'invalid_grant', error_description: 'AADSTS70000: bad code' });
      if (form.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
      return json(200, { token_type: 'Bearer', id_token: await mintIdToken(nextClaims) });
    }
    json(404, { error: 'not found' });
  });
  await new Promise<void>((r) => idp.listen(0, '127.0.0.1', r));
  idpBase = `http://127.0.0.1:${(idp.address() as { port: number }).port}`;

  Object.assign(process.env, {
    NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_SECRET: 'test-secret-test-secret-test-secret-1234',
    ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT_ID, ENTRA_CLIENT_SECRET: CLIENT_SECRET, ENTRA_AUTHORITY: idpBase,
    ENTRA_REDIRECT_URI: 'http://app.test/api/auth/entra/callback', ENTRA_ALLOWED_DOMAINS: 'corp.vn',
    ENTRA_ADMIN_ROLES: 'ReportStudio.Admin', ENTRA_EDITOR_ROLES: 'ReportStudio.Editor', ENTRA_DEFAULT_ROLE: 'viewer',
  });
  const { createApp } = await import('../src/app.js');
  app = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((r) => app.once('listening', r));
  appBase = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise((r) => app.close(r));
  await new Promise((r) => idp.close(r));
});

const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? null;
const cookieValue = (c: string) => c.split(';')[0]!;

/** Runs the browser's part of the dance and returns the callback response. */
async function signIn(claims: Record<string, unknown>, opts: { returnTo?: string; tamperState?: boolean } = {}) {
  nextClaims = claims;
  const start = await fetch(`${appBase}/api/auth/entra/login?returnTo=${encodeURIComponent(opts.returnTo ?? '/dashboards')}`, { redirect: 'manual' });
  expect(start.status).toBe(302);
  const authorize = new URL(start.headers.get('location')!);
  const attemptCookie = cookieOf(start, 'rs_entra')!;
  expect(attemptCookie).toContain('HttpOnly');
  expect(attemptCookie).toContain('Path=/api/auth/entra');
  nextClaims = { ...claims, nonce: authorize.searchParams.get('nonce') };
  const state = opts.tamperState ? 'wrong' : authorize.searchParams.get('state')!;
  const cb = await fetch(`${appBase}/api/auth/entra/callback?code=code-1&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie: cookieValue(attemptCookie) } });
  return { start, authorize, cb };
}

describe('Microsoft Entra sign-in flow', () => {
  it('advertises both providers', async () => {
    const res = await fetch(`${appBase}/api/auth/providers`);
    expect(await res.json()).toEqual({ local: true, entra: true });
  });

  it('redirects to Entra with PKCE, state and nonce', async () => {
    const { authorize } = await signIn({ oid: 'oid-1', preferred_username: 'An.Nguyen@corp.vn', name: 'Nguyễn Văn An' }, { returnTo: '/dashboards/5' });
    expect(authorize.origin).toBe(idpBase);
    expect(authorize.pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`);
    const q = authorize.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('redirect_uri')).toBe('http://app.test/api/auth/entra/callback');
    expect(q.get('scope')).toBe('openid profile email');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(q.get('nonce')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('exchanges the code with the matching PKCE verifier and client secret', async () => {
    tokenRequests.length = 0;
    const { authorize } = await signIn({ oid: 'oid-1', preferred_username: 'An.Nguyen@corp.vn', name: 'Nguyễn Văn An' });
    const form = tokenRequests[0]!;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('code-1');
    expect(form.get('client_secret')).toBe(CLIENT_SECRET);
    expect(form.get('redirect_uri')).toBe('http://app.test/api/auth/entra/callback');
    expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(authorize.searchParams.get('code_challenge'));
  });

  it('provisions an account, maps the role, sets the session and returns to the requested page', async () => {
    users.length = 0; nextId = 1;
    const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'An.Nguyen@corp.vn', name: 'Nguyễn Văn An', roles: ['ReportStudio.Editor'] }, { returnTo: '/dashboards/5' });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('/dashboards/5');
    const session = cookieOf(cb, 'rs_session')!;
    expect(session).toContain('HttpOnly');
    expect(cookieOf(cb, 'rs_entra')).toMatch(/Expires=Thu, 01 Jan 1970/); // attempt cookie cleared

    const me = await fetch(`${appBase}/api/auth/me`, { headers: { cookie: cookieValue(session) } });
    expect(me.status).toBe(200);
    const { user } = (await me.json()) as { user: Record<string, unknown> };
    expect(user).toMatchObject({ username: 'an.nguyen@corp.vn', displayName: 'Nguyễn Văn An', role: 'editor', provider: 'entra', hasPassword: false, email: 'an.nguyen@corp.vn' });
    expect(users).toHaveLength(1);
    expect(users[0]!.password_hash).toBeNull();
  });

  it('reuses the account on the next sign-in and syncs name and mapped role', async () => {
    const before = users.length;
    const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'An.Nguyen@corp.vn', name: 'An Nguyen', roles: ['ReportStudio.Admin'] });
    expect(cb.status).toBe(302);
    expect(users).toHaveLength(before);
    expect(users.find((u) => u.external_id === 'oid-1')).toMatchObject({ display_name: 'An Nguyen', role: 'admin' });
  });

  it('keeps the local role when the token carries no mapped role', async () => {
    const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'An.Nguyen@corp.vn', name: 'An Nguyen' });
    expect(cb.status).toBe(302);
    expect(users.find((u) => u.external_id === 'oid-1')!.role).toBe('admin');
  });

  it('links a pre-created local account by username and keeps its password', async () => {
    users.push({ id: nextId++, username: 'binh@corp.vn', display_name: 'Bình', password_hash: '$2a$10$hash', role: 'editor', auth_provider: 'local', external_id: null, email: null, created_at: '2026-01-01 00:00:00' });
    const { cb } = await signIn({ oid: 'oid-2', preferred_username: 'Binh@corp.vn', name: 'Trần Bình' });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('/dashboards');
    const u = users.find((x) => x.username === 'binh@corp.vn')!;
    expect(u).toMatchObject({ auth_provider: 'entra', external_id: 'oid-2', email: 'binh@corp.vn', password_hash: '$2a$10$hash', display_name: 'Trần Bình', role: 'editor' });
    expect(users.filter((x) => x.external_id === 'oid-2')).toHaveLength(1);
  });

  it('refuses accounts outside the allowed domains', async () => {
    const before = users.length;
    const { cb } = await signIn({ oid: 'oid-3', preferred_username: 'mallory@evil.example', name: 'Mallory' });
    expect(cb.headers.get('location')).toBe('/login?error=entra_domain');
    expect(cookieOf(cb, 'rs_session')).toBeNull();
    expect(users).toHaveLength(before);
  });

  it('rejects a callback whose state does not match the attempt cookie', async () => {
    const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'an.nguyen@corp.vn' }, { tamperState: true });
    expect(cb.headers.get('location')).toBe('/login?error=entra_state');
    expect(cookieOf(cb, 'rs_session')).toBeNull();
  });

  it('rejects a callback without the attempt cookie', async () => {
    const cb = await fetch(`${appBase}/api/auth/entra/callback?code=x&state=y`, { redirect: 'manual' });
    expect(cb.headers.get('location')).toBe('/login?error=entra_state');
  });

  it('reports a cancelled sign-in', async () => {
    const start = await fetch(`${appBase}/api/auth/entra/login`, { redirect: 'manual' });
    const cb = await fetch(`${appBase}/api/auth/entra/callback?error=access_denied&error_description=user+cancelled`, { redirect: 'manual', headers: { cookie: cookieValue(cookieOf(start, 'rs_entra')!) } });
    expect(cb.headers.get('location')).toBe('/login?error=entra_denied');
  });

  it('fails closed when the token endpoint rejects the code', async () => {
    nextTokenStatus = 400;
    try {
      const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'an.nguyen@corp.vn' });
      expect(cb.headers.get('location')).toBe('/login?error=entra_failed');
      expect(cookieOf(cb, 'rs_session')).toBeNull();
    } finally {
      nextTokenStatus = 200;
    }
  });

  it('rejects an ID token with a foreign nonce', async () => {
    nextClaims = {};
    const start = await fetch(`${appBase}/api/auth/entra/login`, { redirect: 'manual' });
    const authorize = new URL(start.headers.get('location')!);
    nextClaims = { oid: 'oid-1', preferred_username: 'an.nguyen@corp.vn', nonce: 'replayed-nonce' };
    const cb = await fetch(`${appBase}/api/auth/entra/callback?code=code-1&state=${authorize.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: cookieValue(cookieOf(start, 'rs_entra')!) } });
    expect(cb.headers.get('location')).toBe('/login?error=entra_failed');
  });

  it('ignores an open-redirect returnTo', async () => {
    const { cb } = await signIn({ oid: 'oid-1', preferred_username: 'an.nguyen@corp.vn' }, { returnTo: '//evil.example/x' });
    expect(cb.headers.get('location')).toBe('/dashboards');
  });

  it('does not let a password-less Entra account sign in with a password', async () => {
    const res = await fetch(`${appBase}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'an.nguyen@corp.vn', password: 'anything' }) });
    expect(res.status).toBe(401);
  });
});
