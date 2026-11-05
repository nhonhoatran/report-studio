import { Router } from 'express';
import { z } from 'zod';
import { isAdmin, requireAuth, requirePermission, type RequestUser } from '../auth/middleware.js';
import { PERMISSIONS, ROLE_NAME_PATTERN, permissionsNotHeld, type Permission } from '../auth/permissions.js';
import { createRole, deleteRole, listRoles, updateRole } from '../auth/roles.js';
import { forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';

/** Only an administrator may hand out what they do not hold themselves, or touch the role they are signed in with. */
function assertMayShape(caller: RequestUser, name: string, permissions: Permission[] | undefined): void {
  if (isAdmin(caller)) return;
  if (name === caller.role) throw forbidden('You cannot change the role you are signed in with', 'permission_denied', { permission: 'roles.manage' });
  const missing = permissionsNotHeld(caller.permissions, permissions ?? []);
  if (missing.length) throw forbidden(`You cannot grant permissions you do not hold: ${missing.join(', ')}`, 'permission_denied', { permission: missing[0] });
}

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

const permissionList = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).transform((list) => Array.from(new Set(list)));
const createSchema = z.object({ name: z.string().regex(ROLE_NAME_PATTERN), label: z.string().min(1).max(80), permissions: permissionList.default([]) });
const updateSchema = z.object({ label: z.string().min(1).max(80).optional(), permissions: permissionList.optional() });

/** Every signed-in user may read the roles: the users panel and the policy editor list them, and nothing in them is secret. */
rolesRouter.get('/', async (_req, res) => {
  res.json({ roles: await listRoles(), permissions: PERMISSIONS });
});

rolesRouter.post('/', requirePermission('roles.manage'), async (req, res) => {
  const body = parse(createSchema, req.body);
  assertMayShape(req.user!, body.name, body.permissions);
  res.status(201).json({ role: await createRole(body) });
});

rolesRouter.put('/:name', requirePermission('roles.manage'), async (req, res) => {
  const body = parse(updateSchema, req.body);
  assertMayShape(req.user!, String(req.params.name), body.permissions);
  res.json({ role: await updateRole(String(req.params.name), body) });
});

rolesRouter.delete('/:name', requirePermission('roles.manage'), async (req, res) => {
  assertMayShape(req.user!, String(req.params.name), undefined);
  await deleteRole(String(req.params.name));
  res.status(204).end();
});
