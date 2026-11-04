import { describe, expect, it } from 'vitest';
import { complete, geminiRequest, openAiRequest, resolveBaseUrl, type ProviderConfig } from '../src/ai/providers.js';
import { HttpError } from '../src/lib/errors.js';

const req = { system: 'sys', user: 'usr', jsonSchema: { type: 'object' } };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('resolveBaseUrl', () => {
  it('uses the provider default, trims slashes and requires one for compatible servers', () => {
    expect(resolveBaseUrl({ kind: 'openai', model: 'm', apiKey: 'k' })).toBe('https://api.openai.com/v1');
    expect(resolveBaseUrl({ kind: 'openai_compatible', model: 'm', apiKey: 'k', baseUrl: 'http://ollama:11434/v1/' })).toBe('http://ollama:11434/v1');
    expect(() => resolveBaseUrl({ kind: 'openai_compatible', model: 'm', apiKey: 'k' })).toThrow(HttpError);
  });
});

describe('openai-style providers', () => {
  const openai: ProviderConfig = { kind: 'openai', model: 'gpt-test', apiKey: 'sk-test' };
  it('shapes a chat-completions request with a JSON schema for OpenAI and json_object for compatible servers', () => {
    const a = openAiRequest(openai, req);
    expect(a.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(a.body.model).toBe('gpt-test');
    expect((a.body.response_format as { type: string }).type).toBe('json_schema');
    const b = openAiRequest({ kind: 'openai_compatible', model: 'llama3', apiKey: 'x', baseUrl: 'http://localhost:11434/v1' }, req);
    expect(b.url).toBe('http://localhost:11434/v1/chat/completions');
    expect((b.body.response_format as { type: string }).type).toBe('json_object');
  });
  it('sends the bearer key and returns the message text', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"suggestions":[]}' } }] }));
    const out = await complete(openai, req, { fetch: fetchImpl });
    expect(out.text).toBe('{"suggestions":[]}');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(calls[0]!.init.body)).messages[0]).toEqual({ role: 'system', content: 'sys' });
  });
  it('joins content parts and maps 401 to ai_auth_failed and 500 to ai_provider_error', async () => {
    const parts = fakeFetch(() => jsonResponse({ choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] } }] }));
    expect((await complete(openai, req, { fetch: parts.fetchImpl })).text).toBe('{"a":1}');
    const denied = fakeFetch(() => jsonResponse({ error: { message: 'Incorrect API key' } }, 401));
    await expect(complete(openai, req, { fetch: denied.fetchImpl })).rejects.toMatchObject({ code: 'ai_auth_failed', status: 502 });
    const down = fakeFetch(() => new Response('upstream exploded', { status: 500 }));
    await expect(complete(openai, req, { fetch: down.fetchImpl })).rejects.toMatchObject({ code: 'ai_provider_error' });
  });
});

describe('gemini', () => {
  const gemini: ProviderConfig = { kind: 'gemini', model: 'gemini-test', apiKey: 'g-key' };
  it('targets generateContent with the key in a header and reads the candidate text', async () => {
    expect(geminiRequest(gemini, req).url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"suggestions":[]}' }] } }] }));
    const out = await complete(gemini, req, { fetch: fetchImpl });
    expect(out.text).toBe('{"suggestions":[]}');
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    expect(calls[0]!.url).not.toContain('g-key');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toBe('sys');
  });
  it('reports a blocked prompt as a bad response', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(complete(gemini, req, { fetch: fetchImpl })).rejects.toMatchObject({ code: 'ai_bad_response' });
  });
});

describe('anthropic', () => {
  const anthropic: ProviderConfig = { kind: 'anthropic', model: 'claude-test', apiKey: 'sk-ant-test' };
  const message = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: '{"suggestions":[]}' }], usage: { input_tokens: 1, output_tokens: 1 } };
  it('calls /v1/messages through the SDK with the key header and a JSON output format', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(message));
    const out = await complete(anthropic, req, { fetch: fetchImpl });
    expect(out.text).toBe('{"suggestions":[]}');
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers(calls[0]!.init.headers as HeadersInit);
    expect(headers.get('authorization') ?? headers.get('x-api-key')).toMatch(/sk-ant-test$/);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe('claude-test');
    expect(body.system).toBe('sys');
    expect(body.output_config.format.type).toBe('json_schema');
  });
  it('maps an authentication error to ai_auth_failed', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401));
    await expect(complete(anthropic, req, { fetch: fetchImpl })).rejects.toMatchObject({ code: 'ai_auth_failed' });
  });
});
