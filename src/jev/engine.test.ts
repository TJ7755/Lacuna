import { afterEach, expect, it, vi } from 'vitest';
import { createJevEngine } from './engine';
import { JEV_CONSENT_VERSION } from './index';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';

const emptyCache = () => ({ get: vi.fn(async () => undefined), put: vi.fn(async () => {}) });
const request = { cardId: 'c', prompt: 'What?', expected: 'Water', answer: 'Water molecules' };
afterEach(() => { localStorage.clear(); vi.useRealTimers(); });
it.each([null, { enabled: false, acceptedConsentVersion: 1 }, { enabled: true, acceptedConsentVersion: null }, { enabled: true, acceptedConsentVersion: 0 }])('does no work without current consent: %j', async (settings) => {
  if (settings) localStorage.setItem('lacuna.jevSettings', JSON.stringify(settings));
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(); const engine = createJevEngine({ fetcher, cache: emptyCache() });
  expect(engine.marker()).toBeNull();
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('requires a code, refuses stale enable and aborts marking when disabled', async () => {
  const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(0); expect(engine.settings().enabled).toBe(false);
  engine.enable(JEV_CONSENT_VERSION); expect(engine.marker()).toBeNull();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const pending = engine.markTyped(request);
  engine.disable();
  expect(await pending).toEqual({ outcome: 'unsure' });
});
it('reuses session tokens and cached decisions, mapping confident yes and no with provenance', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn().mockImplementation(async (url) => url.endsWith('/session')
    ? Response.json({ token: 'session', expiresAt: Date.now() + 60_000 })
    : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }));
  const engine = createJevEngine({ fetcher }); engine.enable(1);
  expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct', provenance: { by: 'jev', model: 'jev-1.14.0', confidence: 0.97 } });
  expect(await engine.markTyped({ ...request, answer: ' Water   molecules ' })).toMatchObject({ outcome: 'correct' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValue(Response.json({ model: 'jev-1.14.0', value: 0, confidence: 0.98, inputTokens: 12 }));
  expect(await engine.markTyped({ ...request, answer: 'Fire' })).toMatchObject({ outcome: 'incorrect' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each([[503, 'service-disabled'], [429, 'limit-reached'], [401, 'access-code-rejected']])('silently pauses on status %s', async (status, reason) => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
  const engine = createJevEngine({ fetcher, cache: emptyCache() }); engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason });
});
it('resolves a hung transport within the typed timeout', async () => {
  vi.useFakeTimers(); localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const engine = createJevEngine({ fetcher: vi.fn(() => new Promise<Response>(() => {})) }); engine.enable(1);
  const result = engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
});
