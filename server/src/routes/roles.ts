import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { PERMISSIONS, ROLE_NAME_PATTERN } from '../auth/permissions.js';
import { createRole, deleteRole, listRoles, updateRole } from '../auth/roles.js';
import { parse } from '../lib/validate.js';

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
  res.status(201).json({ role: await createRole(body) });
});

rolesRouter.put('/:name', requirePermission('roles.manage'), async (req, res) => {
  const body = parse(updateSchema, req.body);
  res.json({ role: await updateRole(String(req.params.name), body) });
});

rolesRouter.delete('/:name', requirePermission('roles.manage'), async (req, res) => {
  await deleteRole(String(req.params.name));
  res.status(204).end();
});
