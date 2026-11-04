import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

/**
 * One adapter per kind of API key the admin can register. Every adapter takes a system +
 * user prompt and returns the model's text; the caller parses it. Keys never leave the
 * server: the browser only sees provider names.
 */
export const PROVIDER_KINDS = ['anthropic', 'openai', 'gemini', 'openai_compatible'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** Suggested model per kind, shown as the form placeholder; the admin may type any model id. */
export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  openai_compatible: '',
};

export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai_compatible: '',
};

export interface ProviderConfig { kind: ProviderKind; model: string; baseUrl?: string | null; apiKey: string }

export interface CompletionRequest {
  system: string;
  user: string;
  /** JSON schema the answer must follow; adapters pass it on where the API supports it. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult { text: string; durationMs: number }

/** Injectable for tests; defaults to the platform fetch. */
export interface ProviderDeps { fetch: typeof fetch }
const defaultDeps: ProviderDeps = { fetch: (...args) => globalThis.fetch(...args) };

const providerError = (status: number, message: string) =>
  status === 401 || status === 403
    ? new HttpError(502, `AI provider rejected the API key: ${message}`, 'ai_auth_failed', { status, message })
    : new HttpError(502, `AI provider error (${status}): ${message}`, 'ai_provider_error', { status, message });

const timeoutError = (seconds: number) => new HttpError(504, `AI provider did not answer within ${seconds}s`, 'ai_timeout', { seconds });

export function resolveBaseUrl(p: ProviderConfig): string {
  const raw = (p.baseUrl ?? '').trim() || DEFAULT_BASE_URLS[p.kind];
  if (!raw) throw new HttpError(400, 'An OpenAI-compatible provider needs a base URL', 'validation_failed');
  return raw.replace(/\/+$/, '');
}

export async function complete(p: ProviderConfig, req: CompletionRequest, deps: ProviderDeps = defaultDeps): Promise<CompletionResult> {
  const started = Date.now();
  const timeoutMs = req.timeoutMs ?? config.ai.timeoutSeconds * 1000;
  const text = await (p.kind === 'anthropic'
    ? completeAnthropic(p, req, timeoutMs, deps)
    : p.kind === 'gemini'
      ? completeGemini(p, req, timeoutMs, deps)
      : completeOpenAi(p, req, timeoutMs, deps));
  return { text, durationMs: Date.now() - started };
}

// ---------------------------------------------------------------------------------------
// Anthropic: official SDK, structured output through output_config.format.
// ---------------------------------------------------------------------------------------
async function completeAnthropic(p: ProviderConfig, req: CompletionRequest, timeoutMs: number, deps: ProviderDeps): Promise<string> {
  const client = new Anthropic({ apiKey: p.apiKey, baseURL: resolveBaseUrl(p), timeout: timeoutMs, maxRetries: 1, fetch: deps.fetch });
  try {
    const res = await client.messages.create({
      model: p.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: {
        effort: 'low', // a chart spec is a small, well-defined task
        ...(req.jsonSchema ? { format: { type: 'json_schema' as const, schema: req.jsonSchema } } : {}),
      },
    });
    if (res.stop_reason === 'refusal') {
      throw new HttpError(502, 'AI provider declined the request', 'ai_bad_response', { reason: res.stop_details?.explanation ?? null });
    }
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw providerError(err.status, err.message);
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw timeoutError(Math.round(timeoutMs / 1000));
    if (err instanceof Anthropic.APIError) throw providerError(err.status ?? 502, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------------------
// OpenAI and any server speaking its chat-completions dialect (Ollama, vLLM, DeepSeek, Groq…).
// ---------------------------------------------------------------------------------------
export function openAiRequest(p: ProviderConfig, req: CompletionRequest): { url: string; body: Record<string, unknown> } {
  const responseFormat = p.kind === 'openai' && req.jsonSchema
    ? { type: 'json_schema', json_schema: { name: 'report_studio_suggestions', schema: req.jsonSchema } }
    : { type: 'json_object' };
  return {
    url: `${resolveBaseUrl(p)}/chat/completions`,
    body: {
      model: p.model,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      response_format: responseFormat,
      ...(req.maxTokens ? { max_completion_tokens: req.maxTokens } : {}),
    },
  };
}

async function completeOpenAi(p: ProviderConfig, req: CompletionRequest, timeoutMs: number, deps: ProviderDeps): Promise<string> {
  const { url, body } = openAiRequest(p, req);
  const data = await postJson(deps, url, body, { authorization: `Bearer ${p.apiKey}` }, timeoutMs);
  const choice = (data as { choices?: Array<{ message?: { content?: unknown; refusal?: string } }> }).choices?.[0];
  if (choice?.message?.refusal) throw new HttpError(502, 'AI provider declined the request', 'ai_bad_response', { reason: choice.message.refusal });
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  throw new HttpError(502, 'AI provider returned no text', 'ai_bad_response');
}

// ---------------------------------------------------------------------------------------
// Google Gemini: generateContent with a JSON mime type.
// ---------------------------------------------------------------------------------------
export function geminiRequest(p: ProviderConfig, req: CompletionRequest): { url: string; body: Record<string, unknown> } {
  return {
    url: `${resolveBaseUrl(p)}/models/${encodeURIComponent(p.model)}:generateContent`,
    body: {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      },
    },
  };
}

async function completeGemini(p: ProviderConfig, req: CompletionRequest, timeoutMs: number, deps: ProviderDeps): Promise<string> {
  const { url, body } = geminiRequest(p, req);
  const data = await postJson(deps, url, body, { 'x-goog-api-key': p.apiKey }, timeoutMs) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new HttpError(502, 'AI provider declined the request', 'ai_bad_response', { reason: data.promptFeedback.blockReason });
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((x) => x.text ?? '').join('');
  if (!text) throw new HttpError(502, 'AI provider returned no text', 'ai_bad_response');
  return text;
}

// ---------------------------------------------------------------------------------------
async function postJson(deps: ProviderDeps, url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'TimeoutError' || (err as { name?: string }).name === 'AbortError') throw timeoutError(Math.round(timeoutMs / 1000));
    throw new HttpError(502, `Cannot reach AI provider: ${(err as Error).message}`, 'ai_provider_error', { status: 0, message: (err as Error).message });
  }
  const raw = await res.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { message: raw.slice(0, 300) } }; }
  if (!res.ok) {
    const e = (data as { error?: { message?: string } | string }).error;
    const message = typeof e === 'string' ? e : e?.message ?? res.statusText;
    throw providerError(res.status, message);
  }
  return data;
}
