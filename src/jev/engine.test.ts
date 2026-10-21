import { afterEach, expect, it, vi } from 'vitest';
import { createJevEngine } from './engine';
import { JEV_CONSENT_VERSION } from './index';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';

const emptyCache = () => ({ get: vi.fn(async () => undefined), put: vi.fn(async () => {}) });
const request = { cardId: 'c', prompt: 'What?', expected: 'Water', answer: 'Water molecules' };
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
it.each([
  null,
  { enabled: false, acceptedConsentVersion: 1 },
  { enabled: true, acceptedConsentVersion: null },
  { enabled: true, acceptedConsentVersion: 0 },
])('does no work without current consent: %j', async (settings) => {
  if (settings) localStorage.setItem('lacuna.jevSettings', JSON.stringify(settings));
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn();
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  expect(engine.marker()).toBeNull();
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('requires a code, refuses stale enable and aborts marking when disabled', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(0);
  expect(engine.settings().enabled).toBe(false);
  engine.enable(JEV_CONSENT_VERSION);
  expect(engine.marker()).toBeNull();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const pending = engine.markTyped(request);
  engine.disable();
  expect(await pending).toEqual({ outcome: 'unsure' });
});
it('reuses session tokens and cached decisions, mapping confident yes and no with provenance', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      url.endsWith('/session')
        ? Response.json({ token: 'session', expiresAt: Date.now() + 60_000 })
        : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
    );
  const engine = createJevEngine({ fetcher });
  engine.enable(1);
  expect(await engine.markTyped(request)).toMatchObject({
    outcome: 'correct',
    provenance: { by: 'jev', model: 'jev-1.14.0', confidence: 0.97 },
  });
  expect(await engine.markTyped({ ...request, answer: ' Water   molecules ' })).toMatchObject({
    outcome: 'correct',
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValue(
    Response.json({ model: 'jev-1.14.0', value: 0, confidence: 0.98, inputTokens: 12 }),
  );
  expect(await engine.markTyped({ ...request, answer: 'Fire' })).toMatchObject({
    outcome: 'incorrect',
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each([
  [503, 'service-disabled'],
  [429, 'limit-reached'],
  [401, 'access-code-rejected'],
])('silently pauses on status %s', async (status, reason) => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason });
});
it('resolves a hung transport within the typed timeout', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const engine = createJevEngine({ fetcher: vi.fn(() => new Promise<Response>(() => {})) });
  engine.enable(1);
  const result = engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
});
it('abstains on low confidence and offline transport failures', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ token: 's', expiresAt: Date.now() + 60_000 }))
    .mockResolvedValueOnce(
      Response.json({ model: 'jev-1.14.0', value: null, confidence: 0.84, inputTokens: 12 }),
    );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(engine.status().state).toBe('ready');
  fetcher.mockRejectedValue(new Error('network failed'));
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'offline' });
});
it('honours an external abort even if the transport ignores it', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const engine = createJevEngine({
    fetcher: vi.fn(() => new Promise<Response>(() => {})),
    cache: emptyCache(),
  });
  engine.enable(1);
  const controller = new AbortController();
  const pending = engine.markTyped({ ...request, signal: controller.signal });
  controller.abort();
  expect(await pending).toEqual({ outcome: 'unsure' });
  expect(engine.status().state).toBe('ready');
});
it('connects through the existing session exchange and refreshes an expired token', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      url.endsWith('/session')
        ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
        : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.99, inputTokens: 1 }),
    );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  expect(await engine.connectAccessCode('code')).toMatchObject({ ok: false });
  expect(fetcher).not.toHaveBeenCalled();
  engine.enable(1);
  expect(await engine.connectAccessCode('code')).toEqual({ ok: true });
  expect(localStorage.getItem(HOSTED_ACCESS_STORAGE_KEY)).toBe('code');
  await engine.markTyped(request);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  await engine.markTyped(request);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('rechecks current thresholds for a cached verdict before applying it', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn();
  const engine = createJevEngine({
    fetcher,
    cache: {
      get: async () => ({ model: 'jev-1.14.0', value: 1, confidence: 0.84, inputTokens: 12 }),
      put: async () => {},
    },
  });
  engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('stays off if the browser refuses access to localStorage', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Storage denied');
    },
  });
  try {
    expect(createJevEngine().marker()).toBeNull();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', descriptor);
  }
});
