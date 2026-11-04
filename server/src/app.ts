import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { HttpError } from './lib/errors.js';
import { attachUser } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { entraRouter } from './routes/entra.js';
import { datasourcesRouter } from './routes/datasources.js';
import { datasetsRouter } from './routes/datasets.js';
import { dashboardsRouter } from './routes/dashboards.js';
import { queryRouter } from './routes/query.js';
import { aiRouter } from './routes/ai.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: config.isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    } : false,
  }));
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => !req.url?.startsWith('/api') },
    serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ statusCode: r.statusCode }) },
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: process.env.npm_package_version ?? '0.1.0' }));
  app.use('/api/auth/entra', wrapAsync(entraRouter));
  app.use('/api/auth', wrapAsync(authRouter));
  app.use('/api/datasources', wrapAsync(datasourcesRouter));
  app.use('/api/datasets', wrapAsync(datasetsRouter));
  app.use('/api/dashboards', wrapAsync(dashboardsRouter));
  app.use('/api/query', wrapAsync(queryRouter));
  app.use('/api/ai', wrapAsync(aiRouter));
  app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));

  // Production: serve the built SPA and fall back to index.html for client routes.
  if (existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h', etag: true }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  } else {
    logger.warn({ webDist: config.webDist }, 'web build not found; only /api is served');
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Malformed JSON body', code: 'malformed_json' });
      return;
    }
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'Internal server error', code: 'internal' });
  });

  return app;
}

/**
 * Express 4 does not forward rejected promises from async handlers to the error
 * middleware. Patch each layer of a router so `throw` inside an async handler works.
 */
function wrapAsync(router: express.Router): express.Router {
  for (const layer of router.stack as Array<{ route?: { stack: Array<{ handle: express.RequestHandler }> } }>) {
    for (const l of layer.route?.stack ?? []) {
      const original = l.handle;
      if (original.length >= 4) continue; // error handler
      l.handle = function wrapped(req: Request, res: Response, next: NextFunction) {
        Promise.resolve((original as express.RequestHandler)(req, res, next)).catch(next);
      } as express.RequestHandler;
    }
  }
  return router;
}
