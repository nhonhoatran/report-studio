import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne, execute } from '../db/metadata.js';
import { COOKIE_NAME, sessionCookieOptions, signSession } from '../auth/jwt.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { entraEnabled } from '../auth/entra.js';
import { findUserById, toPublicUser, toSession, type UserRow } from '../auth/users.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';
import { config } from '../config.js';

export const authRouter = Router();

const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

// A hash nothing matches, so a missing user or a password-less (Entra) account costs the same time.
const DUMMY_HASH = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid';

/** Which sign-in methods the login page should offer. */
authRouter.get('/providers', (_req, res) => {
  res.json({ local: config.auth.localLogin, entra: entraEnabled });
});

authRouter.post('/login', async (req, res) => {
  if (!config.auth.localLogin) throw forbidden('Password sign-in is disabled', 'local_login_disabled');
  const body = parse(loginSchema, req.body);
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE username = ?', [body.username]);
  // constant-ish time: always run bcrypt
  const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !ok) throw unauthorized('Invalid username or password', 'invalid_credentials');
  res.cookie(COOKIE_NAME, signSession(toSession(user)), sessionCookieOptions());
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await findUserById(req.user!.id);
  if (!user) throw unauthorized();
  res.json({ user: toPublicUser(user) });
});


const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const user = await findUserById(req.user!.id);
  if (!user) throw unauthorized();
  if (!user.password_hash) throw badRequest('This account signs in with Microsoft Entra ID and has no password', 'account_has_no_password');
  if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
    throw badRequest('Current password is incorrect', 'password_incorrect');
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
  const rows = await query<UserRow>('SELECT id, username, display_name, role, auth_provider, email, created_at, password_hash IS NOT NULL AS has_password FROM users ORDER BY username');
  res.json({ users: rows.map((u) => ({ ...toPublicUser(u), hasPassword: Boolean(Number(u.has_password)) })) });
});

authRouter.post('/users', requireRole('admin'), async (req, res) => {
  const body = parse(userCreateSchema, req.body);
  if (await queryOne('SELECT id FROM users WHERE username = ?', [body.username])) throw conflict('Username already exists', 'username_exists');
  const result = await execute('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)', [
    body.username, body.displayName, await bcrypt.hash(body.password, 10), body.role,
  ]);
  res.status(201).json({ id: result.insertId });
});

authRouter.put('/users/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const body = parse(userUpdateSchema, req.body);
  const user = await findUserById(id);
  if (!user) throw notFound('User not found', 'user_not_found');
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
  if (id === req.user!.id) throw badRequest('You cannot delete your own account', 'cannot_delete_self');
  await execute('DELETE FROM users WHERE id = ?', [id]);
  res.status(204).end();
});
