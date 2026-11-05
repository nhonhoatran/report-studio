import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { RESOURCE_ACTIONS } from '../auth/abac.js';
import { createPolicy, deletePolicy, listPolicies, policyInputSchema, updatePolicy, type PolicyInput } from '../auth/policies.js';
import { getRole } from '../auth/roles.js';
import { badRequest } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';

/** A typo in a role name would close a resource to everybody (allow) or protect nobody (deny): refuse it. */
async function assertRolesExist(p: PolicyInput): Promise<void> {
  for (const r of p.subject.roles) if (!(await getRole(r))) throw badRequest(`Unknown role "${r}"`, 'policy_invalid', { role: r });
}

export const policiesRouter = Router();
policiesRouter.use(requireAuth, requirePermission('policies.manage'));

policiesRouter.get('/', async (_req, res) => {
  res.json({ policies: await listPolicies(), actions: RESOURCE_ACTIONS });
});

policiesRouter.post('/', async (req, res) => {
  const body = parse(policyInputSchema, req.body);
  await assertRolesExist(body);
  res.status(201).json({ policy: await createPolicy(body, req.user!.id) });
});

policiesRouter.put('/:id', async (req, res) => {
  const body = parse(policyInputSchema, req.body);
  await assertRolesExist(body);
  res.json({ policy: await updatePolicy(parseId(req.params.id), body) });
});

policiesRouter.delete('/:id', async (req, res) => {
  await deletePolicy(parseId(req.params.id));
  res.status(204).end();
});
