import { Router } from 'express';
import { z } from 'zod';
import { execute, queryOne, type Row } from '../db/metadata.js';
import { requireAuth } from '../auth/middleware.js';
import { parse } from '../lib/validate.js';
import { parsePreferencesColumn, preferencesSchema, serializePreferences } from '../auth/preferences.js';

/** The signed-in user's own UI preferences: a client-owned bag (see web/src/store/theme.ts). */
export const preferencesRouter = Router();

preferencesRouter.get('/', requireAuth, async (req, res) => {
  const row = await queryOne<Row & { prefs: string }>('SELECT prefs FROM user_preferences WHERE user_id = ?', [req.user!.id]);
  res.json({ preferences: parsePreferencesColumn(row?.prefs) });
});

const bodySchema = z.object({ preferences: preferencesSchema });

preferencesRouter.put('/', requireAuth, async (req, res) => {
  const body = parse(bodySchema, req.body);
  await execute(
    'INSERT INTO user_preferences (user_id, prefs) VALUES (?, ?) ON DUPLICATE KEY UPDATE prefs = VALUES(prefs)',
    [req.user!.id, serializePreferences(body.preferences)],
  );
  res.json({ preferences: body.preferences });
});
