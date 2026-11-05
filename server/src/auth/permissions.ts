/**
 * RBAC: the catalogue of permissions a role can grant, and the three built-in roles.
 * Routes guard themselves with `requirePermission(<name>)`; the web client mirrors the
 * list (web/src/api/types.ts) to show or hide what the signed-in user may not do.
 */
export const PERMISSIONS = [
  'dashboards.view',     // open saved dashboards and run their visuals
  'dashboards.edit',     // create, edit, duplicate and delete dashboards
  'dashboards.filters',  // add, change and remove a dashboard's own filters (slicers)
  'datasources.view',    // list data sources, browse their tables and columns
  'datasources.manage',  // add, edit, test and delete data sources
  'datasets.manage',     // SQL datasets, including ad-hoc SQL while building one
  'ai.suggest',          // chart suggestions from the configured AI provider
  'ai.manage',           // AI providers and their keys
  'users.manage',        // accounts, their roles and attributes
  'roles.manage',        // roles and the permissions each grants
  'policies.manage',     // access policies (ABAC)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (v: unknown): v is Permission => typeof v === 'string' && (PERMISSIONS as readonly string[]).includes(v);

/** The admin role always holds every permission, whatever the roles table says: nobody can lock the last admin out. */
export const ADMIN_ROLE = 'admin';

export interface RoleDefinition { name: string; label: string; permissions: Permission[]; builtin: boolean }

/** Seeded once; an admin may change what editor and viewer grant, and add roles beside them. */
export const BUILTIN_ROLES: RoleDefinition[] = [
  { name: 'admin', label: 'Administrator', permissions: [...PERMISSIONS], builtin: true },
  { name: 'editor', label: 'Editor', permissions: ['dashboards.view', 'dashboards.edit', 'datasources.view', 'datasources.manage', 'datasets.manage', 'ai.suggest'], builtin: true },
  { name: 'viewer', label: 'Viewer', permissions: ['dashboards.view'], builtin: true },
];

export const BUILTIN_ROLE_NAMES = BUILTIN_ROLES.map((r) => r.name);

/** Role names are identifiers: short, lower-case, safe in a URL. */
export const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
