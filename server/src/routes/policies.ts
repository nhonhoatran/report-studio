import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { RESOURCE_ACTIONS } from '../auth/abac.js';
import { createPolicy, deletePolicy, listPolicies, policyInputSchema, updatePolicy } from '../auth/policies.js';
import { parse, parseId } from '../lib/validate.js';

export const policiesRouter = Router();
policiesRouter.use(requireAuth, requirePermission('policies.manage'));

policiesRouter.get('/', async (_req, res) => {
  res.json({ policies: await listPolicies(), actions: RESOURCE_ACTIONS });
});

policiesRouter.post('/', async (req, res) => {
  const body = parse(policyInputSchema, req.body);
  res.status(201).json({ policy: await createPolicy(body, req.user!.id) });
});

policiesRouter.put('/:id', async (req, res) => {
  const body = parse(policyInputSchema, req.body);
  res.json({ policy: await updatePolicy(parseId(req.params.id), body) });
});

policiesRouter.delete('/:id', async (req, res) => {
  await deletePolicy(parseId(req.params.id));
  res.status(204).end();
});
