import { config } from '../config.js';
import { execute, queryOne } from '../db/metadata.js';
import { logger } from '../lib/logger.js';
import {
  displayNameFromClaims, domainAllowed, emailFromClaims, roleFromClaims, usernameFromClaims, type EntraClaims,
} from './entraMapping.js';
import type { UserRow } from './users.js';

export type EntraResolution =
  | { kind: 'ok'; user: UserRow }
  | { kind: 'domain_not_allowed' }
  | { kind: 'no_account' };

/**
 * Finds or creates the local account behind a verified Entra identity:
 * 1. an account already linked to this object id;
 * 2. an unlinked account whose username or e-mail equals the UPN / e-mail (pre-created by an admin), which gets linked;
 * 3. a new account, when auto-provisioning is on.
 * Display name, e-mail and (when the role mapping matches) the role are synced on every sign-in.
 */
export async function resolveEntraUser(claims: EntraClaims): Promise<EntraResolution> {
  const oid = claims.oid!;
  const email = emailFromClaims(claims);
  if (!domainAllowed(email, config.entra.allowedDomains)) return { kind: 'domain_not_allowed' };

  const mappedRole = roleFromClaims(claims, config.entra.roles);
  const displayName = displayNameFromClaims(claims);

  let user = await queryOne<UserRow>('SELECT * FROM users WHERE auth_provider = ? AND external_id = ?', ['entra', oid]);

  if (!user) {
    const candidates = [...new Set([email, claims.preferred_username?.trim().toLowerCase()].filter((v): v is string => !!v))];
    if (candidates.length) {
      const marks = candidates.map(() => '?').join(', ');
      user = await queryOne<UserRow>(
        `SELECT * FROM users WHERE external_id IS NULL AND (LOWER(username) IN (${marks}) OR LOWER(email) IN (${marks})) ORDER BY id LIMIT 1`,
        [...candidates, ...candidates],
      );
      if (user) {
        await execute('UPDATE users SET auth_provider = ?, external_id = ?, email = COALESCE(email, ?) WHERE id = ?', ['entra', oid, email, user.id]);
        logger.info({ userId: user.id, username: user.username }, 'linked existing account to Microsoft Entra identity');
      }
    }
  }

  if (!user) {
    if (!config.entra.autoProvision) return { kind: 'no_account' };
    const username = await uniqueUsername(usernameFromClaims(claims), oid);
    const role = mappedRole ?? config.entra.defaultRole;
    const result = await execute(
      'INSERT INTO users (username, display_name, password_hash, role, auth_provider, external_id, email) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      [username, displayName, role, 'entra', oid, email],
    );
    user = (await queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [result.insertId]))!;
    logger.info({ userId: user.id, username, role }, 'provisioned account from Microsoft Entra sign-in');
    return { kind: 'ok', user };
  }

  const role = mappedRole ?? user.role;
  const nextEmail = email ?? user.email;
  if (role !== user.role || displayName !== user.display_name || nextEmail !== user.email) {
    await execute('UPDATE users SET display_name = ?, role = ?, email = ? WHERE id = ?', [displayName, role, nextEmail, user.id]);
    user = { ...user, display_name: displayName, role, email: nextEmail } as UserRow;
  }
  return { kind: 'ok', user };
}

/** users.username is unique; a clash with an unrelated account gets a short id suffix. */
async function uniqueUsername(base: string, oid: string): Promise<string> {
  const taken = await queryOne('SELECT id FROM users WHERE username = ?', [base]);
  if (!taken) return base;
  const suffix = `~${oid.replace(/-/g, '').slice(0, 8)}`;
  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}
