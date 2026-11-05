import { execute, query, queryOne, type Row } from '../db/metadata.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ADMIN_ROLE, BUILTIN_ROLES, PERMISSIONS, ROLE_NAME_PATTERN, isPermission, type Permission, type RoleDefinition } from './permissions.js';

/*
 * The roles table behind RBAC, read through a short cache: every request resolves the signed-in
 * user's permissions from it, so a change an admin makes applies within seconds, without a new login.
 */

interface RoleRow extends Row { name: string; label: string; permissions: string; builtin: number }

const CACHE_TTL_MS = 15_000;
let cache: { at: number; roles: RoleDefinition[] } | null = null;

function parsePermissions(raw: string): Permission[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isPermission) : [];
  } catch { return []; }
}

function fromRow(r: RoleRow): RoleDefinition {
  const builtin = Boolean(Number(r.builtin));
  // the admin role is never short of a permission, whatever the row says
  const permissions = r.name === ADMIN_ROLE ? [...PERMISSIONS] : parsePermissions(r.permissions);
  return { name: r.name, label: r.label, permissions, builtin };
}

export function invalidateRoles(): void { cache = null; }

export async function listRoles(): Promise<RoleDefinition[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.roles;
  const rows = await query<RoleRow>('SELECT name, label, permissions, builtin FROM roles ORDER BY builtin DESC, name');
  const roles = rows.map(fromRow);
  cache = { at: Date.now(), roles };
  return roles;
}

export async function getRole(name: string): Promise<RoleDefinition | null> {
  return (await listRoles()).find((r) => r.name === name) ?? null;
}

/** What a role grants; an unknown role (deleted under a signed-in user) grants nothing. */
export async function permissionsForRole(name: string): Promise<Permission[]> {
  if (name === ADMIN_ROLE) return [...PERMISSIONS];
  return (await getRole(name))?.permissions ?? [];
}

/** Make sure the three built-in roles exist (a database created before RBAC, or a row deleted by hand). */
export async function seedRoles(): Promise<void> {
  for (const r of BUILTIN_ROLES) {
    await execute('INSERT IGNORE INTO roles (name, label, permissions, builtin) VALUES (?, ?, ?, 1)', [r.name, r.label, JSON.stringify(r.permissions)]);
  }
  invalidateRoles();
}

export interface RoleInput { name: string; label: string; permissions: Permission[] }

export async function createRole(input: RoleInput): Promise<RoleDefinition> {
  if (!ROLE_NAME_PATTERN.test(input.name)) throw badRequest('Role name must be 2-32 lower-case letters, digits, _ or -', 'invalid_role', { name: input.name });
  if (await queryOne('SELECT name FROM roles WHERE name = ?', [input.name])) throw conflict('A role with that name already exists', 'role_name_exists');
  await execute('INSERT INTO roles (name, label, permissions, builtin) VALUES (?, ?, ?, 0)', [input.name, input.label, JSON.stringify(input.permissions)]);
  invalidateRoles();
  return (await getRole(input.name))!;
}

/** Label and permissions; the admin role keeps every permission, and a built-in role keeps its name. */
export async function updateRole(name: string, patch: Partial<Omit<RoleInput, 'name'>>): Promise<RoleDefinition> {
  const role = await getRole(name);
  if (!role) throw notFound('Role not found', 'role_not_found');
  const permissions = name === ADMIN_ROLE ? [...PERMISSIONS] : patch.permissions ?? role.permissions;
  await execute('UPDATE roles SET label = ?, permissions = ? WHERE name = ?', [patch.label ?? role.label, JSON.stringify(permissions), name]);
  invalidateRoles();
  return (await getRole(name))!;
}

export async function deleteRole(name: string): Promise<void> {
  const role = await getRole(name);
  if (!role) throw notFound('Role not found', 'role_not_found');
  if (role.builtin) throw badRequest('Built-in roles cannot be deleted', 'role_builtin');
  const used = await queryOne<Row & { c: number }>('SELECT COUNT(*) AS c FROM users WHERE role = ?', [name]);
  if (used && Number(used.c) > 0) throw conflict('Users still have this role', 'role_in_use');
  await execute('DELETE FROM roles WHERE name = ?', [name]);
  invalidateRoles();
}
