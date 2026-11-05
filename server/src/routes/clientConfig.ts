import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';

/** The server's limits the web client sizes its controls by (a list filter's page, an export). */
export const clientConfigRouter = Router();
clientConfigRouter.use(requireAuth);
clientConfigRouter.get('/', (_req, res) => {
  res.json({ filterValueLimit: config.query.filterValueLimit, exportMaxRows: config.query.exportMaxRows, cacheTtlSeconds: config.query.cacheTtlSeconds });
});
