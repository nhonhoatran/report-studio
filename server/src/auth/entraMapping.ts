import { createHash, randomBytes } from 'node:crypto';

/**
 * Pure helpers for mapping a Microsoft Entra ID token onto a Report Studio account.
 * No I/O and no config here so the rules can be unit-tested.
 */

export type Role = 'admin' | 'editor' | 'viewer';

/** Claims of an Entra v2.0 ID token that the app reads. */
export interface EntraClaims {
  sub?: string;
  /** Directory object id of the user: stable, the account's external id. */
  oid?: string;
  /** Tenant id the user signed in from. */
  tid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  name?: string;
  /** App roles assigned in the enterprise application. */
  roles?: string[];
  /** Group object ids, when the app registration emits the groups claim. */
  groups?: string[];
  nonce?: string;
  iss?: string;
}

export interface RoleMapping { admin: string[]; editor: string[]; viewer: string[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** Best e-mail-like identifier for the user, lower-cased. */
export function emailFromClaims(claims: EntraClaims): string | null {
  for (const v of [claims.email, claims.preferred_username, claims.upn]) {
    if (typeof v === 'string' && EMAIL_RE.test(v.trim())) return v.trim().toLowerCase();
  }
  return null;
}

/** Empty allow-list accepts everyone; otherwise the e-mail domain must be listed. */
export function domainAllowed(email: string | null, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  if (!email) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}

/** Highest local role whose mapped app roles / groups appear in the token; null when nothing matches. */
export function roleFromClaims(claims: EntraClaims, mapping: RoleMapping): Role | null {
  const have = new Set([...(claims.roles ?? []), ...(claims.groups ?? [])].map((s) => String(s).toLowerCase()));
  if (have.size === 0) return null;
  const matches = (list: string[]) => list.some((v) => have.has(v.toLowerCase()));
  if (matches(mapping.admin)) return 'admin';
  if (matches(mapping.editor)) return 'editor';
  if (matches(mapping.viewer)) return 'viewer';
  return null;
}

/** Login name for a provisioned account: the UPN / e-mail, else an id-based fallback. */
export function usernameFromClaims(claims: EntraClaims, maxLength = 64): string {
  const base = emailFromClaims(claims)
    ?? (typeof claims.preferred_username === 'string' && claims.preferred_username.trim() ? claims.preferred_username.trim().toLowerCase() : null)
    ?? `entra-${claims.oid ?? claims.sub ?? 'user'}`;
  const cleaned = base.replace(/[^a-z0-9._@+-]/gi, '_');
  return cleaned.slice(0, maxLength);
}

/** Display name for a provisioned account (users.display_name is VARCHAR(120)). */
export function displayNameFromClaims(claims: EntraClaims, maxLength = 120): string {
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  return (name || emailFromClaims(claims) || usernameFromClaims(claims)).slice(0, maxLength);
}

/** Only same-origin paths may be used as a post-login destination. */
export function safeReturnTo(raw: unknown, fallback = '/dashboards'): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\r\n]/.test(v) || v.startsWith('/api/')) return fallback;
  return v;
}

/** The issuer Entra advertises for multi-tenant authorities carries a `{tenantid}` placeholder. */
export function expectedIssuer(template: string, tid: string | undefined): string | null {
  if (!template.includes('{tenantid}')) return template;
  if (!tid) return null;
  return template.replace('{tenantid}', tid);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** PKCE (RFC 7636) verifier + S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
