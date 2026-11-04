import type { NextFunction, Request, Response } from 'express';
import { COOKIE_NAME, verifySession, type Role, type SessionUser } from './jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const raw = token ?? bearer;
  if (raw) {
    const user = verifySession(raw);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(min: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (ROLE_RANK[req.user.role] < ROLE_RANK[min]) return next(forbidden());
    next();
  };
}
