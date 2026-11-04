import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne, execute, type Row } from '../db/metadata.js';
import { COOKIE_NAME, signSession, type Role, type SessionUser } from '../auth/jwt.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';
import { config } from '../config.js';
import { parsePreferencesColumn, preferencesSchema, serializePreferences } from '../auth/preferences.js';

export const authRouter = Router();

interface UserRow extends Row {
  id: number; username: string; display_name: string; password_hash: string; role: Role; created_at: string; preferences: string | null;
}

const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

function toSession(u: UserRow): SessionUser {
  return { id: Number(u.id), username: u.username, displayName: u.display_name, role: u.role };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    maxAge: config.sessionTtlHours * 3600 * 1000,
    path: '/',
  };
}

authRouter.post('/login', async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE username = ?', [body.username]);
  // constant-ish time: always run bcrypt
  const ok = user ? await bcrypt.compare(body.password, user.password_hash) : await bcrypt.compare(body.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
  if (!user || !ok) throw unauthorized('Invalid username or password');
  const session = toSession(user);
  res.cookie(COOKIE_NAME, signSession(session), cookieOptions());
  res.json({ user: session, preferences: parsePreferencesColumn(user.preferences) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  // the session comes from the JWT; preferences are read fresh so a change on another device shows up
  const row = await queryOne<Row & { preferences: string | null }>('SELECT preferences FROM users WHERE id = ?', [req.user!.id]);
  res.json({ user: req.user, preferences: parsePreferencesColumn(row?.preferences) });
});

// --- per-user UI preferences (any signed-in user, own row only) ---
const preferencesBodySchema = z.object({ preferences: preferencesSchema });

authRouter.put('/preferences', requireAuth, async (req, res) => {
  const body = parse(preferencesBodySchema, req.body);
  const result = await execute('UPDATE users SET preferences = ? WHERE id = ?', [serializePreferences(body.preferences), req.user!.id]);
  if (result.affectedRows === 0) throw notFound('User not found');
  res.json({ preferences: body.preferences });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(body.newPassword, 10), user.id]);
  res.status(204).end();
});

// --- user administration (admin only) ---
const userCreateSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
});
const userUpdateSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
});

authRouter.get('/users', requireRole('admin'), async (_req, res) => {
  const rows = await query<UserRow>('SELECT id, username, display_name, role, created_at FROM users ORDER BY username');
  res.json({ users: rows.map((u) => ({ id: Number(u.id), username: u.username, displayName: u.display_name, role: u.role, createdAt: u.created_at })) });
});

authRouter.post('/users', requireRole('admin'), async (req, res) => {
  const body = parse(userCreateSchema, req.body);
  if (await queryOne('SELECT id FROM users WHERE username = ?', [body.username])) throw conflict('Username already exists');
  const result = await execute('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)', [
    body.username, body.displayName, await bcrypt.hash(body.password, 10), body.role,
  ]);
  res.status(201).json({ id: result.insertId });
});

authRouter.put('/users/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const body = parse(userUpdateSchema, req.body);
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  await execute('UPDATE users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?', [
    body.displayName ?? user.display_name,
    body.role ?? user.role,
    body.password ? await bcrypt.hash(body.password, 10) : user.password_hash,
    id,
  ]);
  res.status(204).end();
});

authRouter.delete('/users/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user!.id) throw badRequest('You cannot delete your own account');
  await execute('DELETE FROM users WHERE id = ?', [id]);
  res.status(204).end();
});
