import type { Row } from '../db/metadata.js';
import { queryOne } from '../db/metadata.js';
import type { Role, SessionUser } from './jwt.js';
import { normalizeAttributes, type Attributes } from './abac.js';
import type { Permission } from './permissions.js';

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
  attributes: string | null;
  created_at: string;
}

/** What the API returns for an account (never the hash): who they are, what they may do, what they are. */
export interface PublicUser extends SessionUser {
  provider: AuthProvider;
  hasPassword: boolean;
  email: string | null;
  permissions: Permission[];
  attributes: Attributes;
  createdAt?: string;
}

export function toSession(u: UserRow): SessionUser {
  return { id: Number(u.id), username: u.username, displayName: u.display_name, role: u.role };
}

/** The stored JSON bag as attribute lists; anything unreadable is an empty bag. */
export function attributesOf(u: Pick<UserRow, 'attributes'>): Attributes {
  if (!u.attributes) return {};
  try { return normalizeAttributes(JSON.parse(u.attributes)); } catch { return {}; }
}

export function toPublicUser(u: UserRow, permissions: Permission[]): PublicUser {
  return { ...toSession(u), provider: u.auth_provider ?? 'local', hasPassword: !!u.password_hash, email: u.email ?? null, permissions, attributes: attributesOf(u), createdAt: u.created_at };
}

export function findUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
}
