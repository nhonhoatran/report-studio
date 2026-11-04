import type { Row } from '../db/metadata.js';
import { queryOne } from '../db/metadata.js';
import type { Role, SessionUser } from './jwt.js';

export type AuthProvider = 'local' | 'entra';

export interface UserRow extends Row {
  id: number;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: Role;
  auth_provider: AuthProvider;
  external_id: string | null;
  email: string | null;
  created_at: string;
  preferences: string | null;
}

/** What the API returns for an account (never the hash). */
export interface PublicUser extends SessionUser {
  provider: AuthProvider;
  hasPassword: boolean;
  email: string | null;
  createdAt?: string;
}

export function toSession(u: UserRow): SessionUser {
  return { id: Number(u.id), username: u.username, displayName: u.display_name, role: u.role };
}

export function toPublicUser(u: UserRow): PublicUser {
  return { ...toSession(u), provider: u.auth_provider ?? 'local', hasPassword: !!u.password_hash, email: u.email ?? null, createdAt: u.created_at };
}

export function findUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
}
