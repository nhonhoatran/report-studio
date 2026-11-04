import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'editor' | 'viewer';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export const COOKIE_NAME = 'rs_session';

export function signSession(user: SessionUser): string {
  return jwt.sign(
    { sub: String(user.id), username: user.username, displayName: user.displayName, role: user.role },
    config.appSecret,
    { expiresIn: `${config.sessionTtlHours}h`, issuer: 'report-studio' },
  );
}

export function verifySession(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, config.appSecret, { issuer: 'report-studio' }) as jwt.JwtPayload;
    if (!payload.sub) return null;
    return {
      id: Number(payload.sub),
      username: String(payload.username),
      displayName: String(payload.displayName ?? payload.username),
      role: (payload.role as Role) ?? 'viewer',
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    maxAge: config.sessionTtlHours * 3600 * 1000,
    path: '/',
  };
}
