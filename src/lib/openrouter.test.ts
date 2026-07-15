import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Gemini SDK so no real network calls are made.
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}));

import { GoogleGenAI } from '@google/genai';
import { callOpenRouter } from './openrouter';

const SYSTEM_PROMPT = 'system';
const USER_MESSAGE = 'user';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('callOpenRouter', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    generateContent.mockReset();
    vi.mocked(GoogleGenAI).mockReset();
    vi.mocked(GoogleGenAI).mockImplementation(
      () => ({ models: { generateContent } }) as unknown as GoogleGenAI,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(console.error).mockRestore();
  });

  it('returns an error when no API keys are configured', async () => {
    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);
    expect(result).toEqual({
      ok: false,
      error: 'No API keys configured (OPENROUTER_API_KEY or GEMINI_API_KEY)',
    });
  });

  it('calls OpenRouter and returns its content on success', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    const fetchMock = mockFetchOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'insight text' } }] }),
    });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result).toEqual({ ok: true, text: 'insight text' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer or-key');
    const body = JSON.parse(options.body);
    expect(body.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_MESSAGE },
    ]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('errors when OpenRouter is the only key and it fails with no fallback', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    mockFetchOnce({ ok: false, status: 500, json: async () => ({}) });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result).toEqual({
      ok: false,
      error: 'No API keys configured (OPENROUTER_API_KEY or GEMINI_API_KEY)',
    });
  });

  it('falls back to Gemini when OpenRouter returns an error status', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GEMINI_API_KEY = 'gm-key';
    mockFetchOnce({ ok: false, status: 429, json: async () => ({}) });
    generateContent.mockResolvedValue({ text: 'gemini fallback text' });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result).toEqual({ ok: true, text: 'gemini fallback text' });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'gm-key' }),
    );
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: USER_MESSAGE,
        config: expect.objectContaining({ systemInstruction: SYSTEM_PROMPT }),
      }),
    );
  });

  it('falls back to Gemini when OpenRouter returns an unexpected response shape', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GEMINI_API_KEY = 'gm-key';
    mockFetchOnce({ ok: true, json: async () => ({ choices: [] }) });
    generateContent.mockResolvedValue({ text: 'gemini text' });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result).toEqual({ ok: true, text: 'gemini text' });
  });

  it('uses Gemini directly when only the Gemini key is configured', async () => {
    process.env.GEMINI_API_KEY = 'gm-key';
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({}) });
    generateContent.mockResolvedValue({ text: 'direct gemini text' });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result).toEqual({ ok: true, text: 'direct gemini text' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an error when the Gemini fallback throws', async () => {
    process.env.GEMINI_API_KEY = 'gm-key';
    generateContent.mockRejectedValue(new Error('boom'));

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result.ok).toBe(false);
    const error = (result as { ok: false; error: string }).error;
    expect(error).toContain('Both OpenRouter and Gemini fallback failed');
    expect(error).toContain('boom');
  });

  it('returns an error when Gemini responds with empty text', async () => {
    process.env.GEMINI_API_KEY = 'gm-key';
    generateContent.mockResolvedValue({ text: '' });

    const result = await callOpenRouter(SYSTEM_PROMPT, USER_MESSAGE);

    expect(result.ok).toBe(false);
    const error = (result as { ok: false; error: string }).error;
    expect(error).toContain('Empty response from Gemini');
  });
});
