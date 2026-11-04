import { Router } from 'express';
import { config } from '../config.js';
import { COOKIE_NAME, sessionCookieOptions, signSession } from '../auth/jwt.js';
import { buildAuthorizationUrl, callbackUrl, entraEnabled, exchangeCode, verifyIdToken } from '../auth/entra.js';
import { resolveEntraUser } from '../auth/entraUsers.js';
import { pkcePair, randomToken, safeReturnTo } from '../auth/entraMapping.js';
import { toSession } from '../auth/users.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';

/**
 * Microsoft Entra ID sign-in (OIDC authorization code + PKCE).
 *   GET /api/auth/entra/login?returnTo=/path  → redirects to Entra
 *   GET /api/auth/entra/callback              → sets the session cookie, redirects to returnTo
 * The login attempt (state, nonce, PKCE verifier, destination) travels in a short-lived
 * encrypted cookie, so no server-side session store is needed.
 */
export const entraRouter = Router();

const ATTEMPT_COOKIE = 'rs_entra';
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const ATTEMPT_COOKIE_PATH = '/api/auth/entra';

/** Codes the login page translates (`/login?error=<code>`). */
export type EntraErrorCode = 'entra_denied' | 'entra_domain' | 'entra_no_account' | 'entra_state' | 'entra_failed';

interface Attempt { state: string; nonce: string; verifier: string; returnTo: string; redirectUri: string; exp: number }

function attemptCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, maxAge: ATTEMPT_TTL_MS, path: ATTEMPT_COOKIE_PATH };
}

function readAttempt(raw: unknown): Attempt | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const a = JSON.parse(decrypt(raw)) as Attempt;
    if (!a.state || !a.nonce || !a.verifier || !a.redirectUri || typeof a.exp !== 'number' || a.exp < Date.now()) return null;
    return a;
  } catch {
    return null;
  }
}

entraRouter.get('/login', async (req, res) => {
  if (!entraEnabled) throw notFound('Microsoft Entra sign-in is not configured');
  const { verifier, challenge } = pkcePair();
  const attempt: Attempt = {
    state: randomToken(),
    nonce: randomToken(),
    verifier,
    returnTo: safeReturnTo(req.query.returnTo),
    redirectUri: callbackUrl(req),
    exp: Date.now() + ATTEMPT_TTL_MS,
  };
  const url = await buildAuthorizationUrl({ state: attempt.state, nonce: attempt.nonce, codeChallenge: challenge, redirectUri: attempt.redirectUri });
  res.cookie(ATTEMPT_COOKIE, encrypt(JSON.stringify(attempt)), attemptCookieOptions());
  res.redirect(302, url);
});

entraRouter.get('/callback', async (req, res) => {
  res.clearCookie(ATTEMPT_COOKIE, { path: ATTEMPT_COOKIE_PATH });
  const fail = (code: EntraErrorCode) => res.redirect(302, `/login?error=${code}`);
  if (!entraEnabled) return fail('entra_failed');

  const attempt = readAttempt(req.cookies?.[ATTEMPT_COOKIE]);
  if (!attempt) return fail('entra_state');

  const q = req.query as Record<string, unknown>;
  if (typeof q.error === 'string') {
    req.log.warn({ error: q.error, description: q.error_description }, 'Microsoft Entra returned an error');
    return fail(q.error === 'access_denied' ? 'entra_denied' : 'entra_failed');
  }
  if (typeof q.code !== 'string' || q.state !== attempt.state) return fail('entra_state');

  try {
    const idToken = await exchangeCode({ code: q.code, codeVerifier: attempt.verifier, redirectUri: attempt.redirectUri });
    const claims = await verifyIdToken(idToken, attempt.nonce);
    const outcome = await resolveEntraUser(claims);
    if (outcome.kind === 'domain_not_allowed') {
      req.log.warn({ oid: claims.oid, username: claims.preferred_username }, 'Microsoft Entra sign-in refused: domain not allowed');
      return fail('entra_domain');
    }
    if (outcome.kind === 'no_account') {
      req.log.warn({ oid: claims.oid, username: claims.preferred_username }, 'Microsoft Entra sign-in refused: no matching account');
      return fail('entra_no_account');
    }
    res.cookie(COOKIE_NAME, signSession(toSession(outcome.user)), sessionCookieOptions());
    res.redirect(302, attempt.returnTo);
  } catch (err) {
    req.log.warn({ err }, 'Microsoft Entra sign-in failed');
    return fail('entra_failed');
  }
});
