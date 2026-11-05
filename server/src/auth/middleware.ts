import type { NextFunction, Request, Response } from 'express';
import { COOKIE_NAME, verifySession, type SessionUser } from './jwt.js';
import { attributesOf, findUserById } from './users.js';
import { permissionsForRole } from './roles.js';
import { listPolicies } from './policies.js';
import { decide, rowFiltersFor, type Attributes, type PolicyAction, type ResourceType, type Subject } from './abac.js';
import { ADMIN_ROLE, type Permission } from './permissions.js';
import type { Filter } from '../query/types.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** The signed-in user as every route sees them: the session, plus what RBAC grants and what ABAC reads. */
export interface RequestUser extends SessionUser {
  permissions: Permission[];
  attributes: Attributes;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
  }
}

/*
 * The cookie proves who the user is; what they may do is read from the database on each request
 * (through a short cache), so a role change, a new policy or a deleted account takes effect at once.
 */
const SUBJECT_TTL_MS = 15_000;
type CachedSubject = { username: string; displayName: string; role: string; attributes: Attributes } | null;
const subjects = new Map<number, { at: number; value: CachedSubject }>();

/** Drop what is cached for one account (after an admin edits it) or for everybody. */
export function forgetSubject(userId?: number): void {
  if (userId === undefined) subjects.clear(); else subjects.delete(userId);
}

async function resolveUser(session: SessionUser): Promise<RequestUser | null> {
  const cached = subjects.get(session.id);
  let value: CachedSubject | undefined = cached && Date.now() - cached.at < SUBJECT_TTL_MS ? cached.value : undefined;
  if (value === undefined) {
    const row = await findUserById(session.id);
    value = row ? { username: row.username, displayName: row.display_name, role: row.role, attributes: attributesOf(row) } : null;
    subjects.set(session.id, { at: Date.now(), value });
  }
  if (!value) return null;
  return { id: session.id, username: value.username, displayName: value.displayName, role: value.role, attributes: value.attributes, permissions: await permissionsForRole(value.role) };
}

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const raw = token ?? bearer;
    if (raw) {
      const session = verifySession(raw);
      if (session) {
        const user = await resolveUser(session);
        if (user) req.user = user;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  next();
}

export const hasPermission = (user: RequestUser | undefined, p: Permission): boolean => !!user && user.permissions.includes(p);

/** RBAC gate: the signed-in user's role must grant the permission. */
export function requirePermission(...any: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!any.some((p) => hasPermission(req.user, p))) return next(forbidden('Missing permission', 'permission_denied', { permission: any[0] }));
    next();
  };
}

const subjectOf = (user: RequestUser): Subject => ({ role: user.role, attributes: user.attributes });

export const isAdmin = (user: RequestUser | undefined): boolean => !!user && user.role === ADMIN_ROLE;

/** ABAC: may this user take the action on that dashboard or data source? Administrators are outside the policies, so nobody can lock them out. */
export async function allowed(user: RequestUser, type: ResourceType, id: number, action: PolicyAction): Promise<boolean> {
  if (isAdmin(user)) return true;
  return decide(await listPolicies(), subjectOf(user), type, id, action) === 'allow';
}

/** Like `allowed`, but a refusal is the 403 the client translates. */
export async function authorize(user: RequestUser, type: ResourceType, id: number, action: PolicyAction): Promise<void> {
  if (!(await allowed(user, type, id, action))) throw forbidden('Access denied by policy', 'access_denied', { type, id, action });
}

/** Row-level security: the filters the policies add to every query this user runs on the data source (none for an administrator). */
export async function rowFilters(user: RequestUser, datasourceId: number): Promise<Filter[]> {
  if (isAdmin(user)) return [];
  return rowFiltersFor(await listPolicies(), subjectOf(user), datasourceId);
}
