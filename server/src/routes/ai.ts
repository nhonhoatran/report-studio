import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction, type Row } from '../db/metadata.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { HttpError, conflict, notFound } from '../lib/errors.js';
import { parse, parseId } from '../lib/validate.js';
import { PROVIDER_KINDS, complete, type ProviderConfig } from '../ai/providers.js';
import { SUGGESTIONS_JSON_SCHEMA, buildPrompt, parseSuggestions, sanitizeSuggestions } from '../ai/suggest.js';

export interface AiProviderRow extends Row {
  id: number; name: string; kind: ProviderConfig['kind']; model: string; base_url: string | null; api_key_enc: string;
  is_default: number; created_by: number | null; created_at: string; updated_at: string;
}

export const aiRouter = Router();
aiRouter.use(requireAuth);

const providerSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(PROVIDER_KINDS),
  model: z.string().min(1).max(160),
  baseUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  apiKey: z.string().min(1).max(2000),
  isDefault: z.boolean().optional(),
});
const updateSchema = providerSchema.partial().extend({ apiKey: z.string().max(2000).optional() });

function publicView(r: AiProviderRow) {
  return {
    id: Number(r.id), name: r.name, kind: r.kind, model: r.model, baseUrl: r.base_url ?? '',
    isDefault: Boolean(Number(r.is_default)), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function loadProvider(id: number): Promise<AiProviderRow> {
  const row = await queryOne<AiProviderRow>('SELECT * FROM ai_providers WHERE id = ?', [id]);
  if (!row) throw notFound('AI provider not found', 'ai_provider_not_found');
  return row;
}

const toConfig = (r: AiProviderRow): ProviderConfig => ({ kind: r.kind, model: r.model, baseUrl: r.base_url, apiKey: decrypt(r.api_key_enc) });

/** Every signed-in user may list providers (names only) so the editor can offer a choice. */
aiRouter.get('/providers', async (_req, res) => {
  const rows = await query<AiProviderRow>('SELECT * FROM ai_providers ORDER BY is_default DESC, name');
  res.json({ providers: rows.map(publicView) });
});

/** Admin only: a provider call with a trivial prompt, so a wrong key fails here and not in the editor. */
aiRouter.post('/providers/test', requireRole('admin'), async (req, res) => {
  const body = parse(updateSchema.extend({ id: z.number().int().positive().optional(), kind: z.enum(PROVIDER_KINDS), model: z.string().min(1).max(160) }), req.body);
  let apiKey = body.apiKey ?? '';
  if (!apiKey && body.id) apiKey = decrypt((await loadProvider(body.id)).api_key_enc);
  if (!apiKey) throw new HttpError(400, 'An API key is required', 'validation_failed');
  try {
    const result = await complete(
      { kind: body.kind, model: body.model, baseUrl: body.baseUrl || null, apiKey },
      { system: 'You are a connectivity check. Reply with JSON only.', user: 'Reply with {"ok":true}.', jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }, maxTokens: 2048 },
    );
    res.json({ ok: true, latencyMs: result.durationMs, model: body.model });
  } catch (err) {
    if (err instanceof HttpError) return res.json({ ok: false, error: err.message, code: err.code, details: err.details });
    throw err;
  }
});

aiRouter.post('/providers', requireRole('admin'), async (req, res) => {
  const body = parse(providerSchema, req.body);
  if (await queryOne('SELECT id FROM ai_providers WHERE name = ?', [body.name])) throw conflict('An AI provider with this name already exists', 'ai_provider_name_exists');
  const count = await queryOne<Row & { c: number }>('SELECT COUNT(*) AS c FROM ai_providers');
  const makeDefault = body.isDefault || Number(count?.c ?? 0) === 0;
  const id = await withTransaction(async (conn) => {
    if (makeDefault) await conn.execute('UPDATE ai_providers SET is_default = 0');
    const [result] = await conn.execute(
      'INSERT INTO ai_providers (name, kind, model, base_url, api_key_enc, is_default, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [body.name, body.kind, body.model, body.baseUrl || null, encrypt(body.apiKey), makeDefault ? 1 : 0, req.user!.id],
    );
    return (result as { insertId: number }).insertId;
  });
  res.status(201).json({ provider: publicView(await loadProvider(id)) });
});

aiRouter.put('/providers/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const body = parse(updateSchema, req.body);
  const current = await loadProvider(id);
  if (body.name && body.name !== current.name) {
    if (await queryOne('SELECT id FROM ai_providers WHERE name = ? AND id <> ?', [body.name, id])) throw conflict('An AI provider with this name already exists', 'ai_provider_name_exists');
  }
  await withTransaction(async (conn) => {
    if (body.isDefault) await conn.execute('UPDATE ai_providers SET is_default = 0');
    await conn.execute(
      'UPDATE ai_providers SET name = ?, kind = ?, model = ?, base_url = ?, api_key_enc = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        body.name ?? current.name, body.kind ?? current.kind, body.model ?? current.model,
        body.baseUrl === undefined ? current.base_url : (body.baseUrl || null),
        body.apiKey ? encrypt(body.apiKey) : current.api_key_enc,
        // the default cannot be switched off by unticking: another provider takes it over instead
        body.isDefault ? 1 : current.is_default, id,
      ],
    );
  });
  res.json({ provider: publicView(await loadProvider(id)) });
});

aiRouter.delete('/providers/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const current = await loadProvider(id);
  await execute('DELETE FROM ai_providers WHERE id = ?', [id]);
  if (Number(current.is_default)) {
    // keep exactly one default while any provider remains
    await execute('UPDATE ai_providers SET is_default = 1 WHERE id = (SELECT id FROM (SELECT id FROM ai_providers ORDER BY created_at, id LIMIT 1) AS t)');
  }
  res.status(204).end();
});

// --- suggestions -----------------------------------------------------------------------------

const suggestSchema = z.object({
  providerId: z.number().int().positive().optional(),
  sourceLabel: z.string().min(1).max(200),
  fields: z.array(z.object({
    name: z.string().min(1).max(64),
    kind: z.enum(['number', 'date', 'string', 'boolean', 'other']),
    dataType: z.string().max(64).optional(),
  })).min(1).max(300),
  prompt: z.string().max(2000).optional(),
  lang: z.string().max(10).optional(),
  count: z.number().int().min(1).max(8).optional(),
});

/** Editors ask for visuals; the answer is validated against `fields` before it is returned. */
aiRouter.post('/suggest', requireRole('editor'), async (req, res) => {
  const body = parse(suggestSchema, req.body);
  const row = body.providerId
    ? await loadProvider(body.providerId)
    : await queryOne<AiProviderRow>('SELECT * FROM ai_providers ORDER BY is_default DESC, created_at, id LIMIT 1');
  if (!row) throw notFound('No AI provider is configured', 'ai_no_provider');
  const { system, user } = buildPrompt({ sourceLabel: body.sourceLabel, fields: body.fields, prompt: body.prompt, lang: body.lang, count: body.count });
  const result = await complete(toConfig(row), { system, user, jsonSchema: SUGGESTIONS_JSON_SCHEMA });
  const suggestions = sanitizeSuggestions(parseSuggestions(result.text), body.fields);
  if (suggestions.length === 0) throw new HttpError(502, 'AI provider returned no usable suggestion', 'ai_bad_response', { detail: 'empty after validation' });
  res.json({ suggestions, provider: publicView(row), durationMs: result.durationMs });
});
