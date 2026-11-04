import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { expectedIssuer, type EntraClaims } from './entraMapping.js';

/**
 * OpenID Connect client for Microsoft Entra ID: discovery, authorization URL,
 * code exchange and ID-token verification. Session handling lives in routes/entra.ts.
 */

interface Metadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

type Jwks = ReturnType<typeof createRemoteJWKSet>;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10_000;
const SCOPE = 'openid profile email';

let cached: { meta: Metadata; jwks: Jwks; fetchedAt: number } | null = null;

export const entraEnabled = config.entra.enabled;

export function discoveryUrl(): string {
  return `${config.entra.authority}/${encodeURIComponent(config.entra.tenantId)}/v2.0/.well-known/openid-configuration`;
}

async function loadMetadata(): Promise<{ meta: Metadata; jwks: Jwks }> {
  if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) return cached;
  const res = await fetch(discoveryUrl(), { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Entra discovery failed with HTTP ${res.status}`);
  const meta = (await res.json()) as Partial<Metadata>;
  for (const k of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof meta[k] !== 'string' || !meta[k]) throw new Error(`Entra discovery document lacks ${k}`);
  }
  cached = { meta: meta as Metadata, jwks: createRemoteJWKSet(new URL(meta.jwks_uri!)), fetchedAt: Date.now() };
  logger.info({ issuer: cached.meta.issuer }, 'loaded Microsoft Entra metadata');
  return cached;
}

/** Where Entra sends the user back; must match the app registration exactly. */
export function callbackUrl(req: Request): string {
  if (config.entra.redirectUri) return config.entra.redirectUri;
  return `${req.protocol}://${req.get('host')}/api/auth/entra/callback`;
}

export async function buildAuthorizationUrl(p: { state: string; nonce: string; codeChallenge: string; redirectUri: string }): Promise<string> {
  const { meta } = await loadMetadata();
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: config.entra.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: p.redirectUri,
    scope: SCOPE,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<string> {
  const { meta } = await loadMetadata();
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: config.entra.clientId,
      client_secret: config.entra.clientSecret,
      grant_type: 'authorization_code',
      code: p.code,
      code_verifier: p.codeVerifier,
      redirect_uri: p.redirectUri,
      scope: SCOPE,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    throw new Error(`Entra token request failed: ${body.error ?? `HTTP ${res.status}`}${body.error_description ? ` – ${body.error_description.split('\n')[0]}` : ''}`);
  }
  return body.id_token;
}

/** Verifies signature, audience, expiry, issuer (per tenant) and the nonce bound to this login attempt. */
export async function verifyIdToken(idToken: string, nonce: string): Promise<EntraClaims> {
  const { meta, jwks } = await loadMetadata();
  const { payload } = await jwtVerify(idToken, jwks, { audience: config.entra.clientId, algorithms: ['RS256'], clockTolerance: 60 });
  const claims = payload as EntraClaims;
  const issuer = expectedIssuer(meta.issuer, claims.tid);
  if (!issuer || claims.iss !== issuer) throw new Error(`Unexpected token issuer ${String(claims.iss)}`);
  if (claims.nonce !== nonce) throw new Error('ID token nonce mismatch');
  if (!claims.oid) throw new Error('ID token lacks the oid claim');
  return claims;
}
