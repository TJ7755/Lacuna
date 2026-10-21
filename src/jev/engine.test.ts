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
it('resolves one hung request within the typed timeout without pausing', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const engine = createJevEngine({ fetcher: vi.fn(() => new Promise<Response>(() => {})) });
  engine.enable(1);
  const result = engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'ready' });
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
it('batches only uncached allocation content and reuses cached lines without a session exchange', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const values = new Map();
  const fetcher = vi.fn(async (url, init) =>
    url.endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : Response.json({
          model: 'jev-1.14.0',
          inputTokens: 20,
          decisions: JSON.parse(init.body).allocations.map(() => ({
            model: 'jev-1.14.0',
            value: 1,
            confidence: 0.97,
          })),
        }),
  );
  const engine = createJevEngine({
    fetcher,
    cache: {
      get: async (hash) => values.get(hash),
      put: async (hash, result) => {
        values.set(hash, result);
      },
    },
  });
  const allocations = [1, 2].map((number) => ({
    prompt: 'Q',
    criterion: `Criterion ${number}`,
    explanation: '',
    maxMarks: 1,
    answer: 'A',
  }));
  expect(await engine.decideAllocations(allocations)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  engine.enable(1);
  expect(await engine.decideAllocations(allocations)).toHaveLength(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await engine.decideAllocations(allocations);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await engine.decideAllocations([allocations[0], { ...allocations[1], criterion: 'Changed' }]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetcher.mock.calls[2][1].body).allocations).toHaveLength(1);
});

it('pauses only after three consecutive failures', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : new Response('', { status: 500 }),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  for (let count = 0; count < 2; count++) {
    expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
    expect(engine.status().state).toBe('ready');
  }
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each([500, 503])(
  'admits only natural requests after growing backoff for status %s and resets on success',
  async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    let failing = true;
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/session')
        ? Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 })
        : failing
          ? new Response('', { status })
          : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
    );
    const engine = createJevEngine({ fetcher, cache: emptyCache() });
    engine.enable(1);
    for (let count = 0; count < (status === 500 ? 3 : 1); count++) await engine.markTyped(request);
    for (const delay of [60_000, 300_000, 900_000, 900_000]) {
      const calls = fetcher.mock.calls.length;
      expect(engine.marker()).toBeNull();
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
      expect(fetcher).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).toHaveBeenCalledTimes(calls);
      expect(engine.status().state).toBe('paused');
      expect(engine.marker()).not.toBeNull();
      await engine.marker()!(request);
      expect(fetcher).toHaveBeenCalledTimes(calls + 1);
      expect(engine.status().state).toBe('paused');
    }
    await vi.advanceTimersByTimeAsync(900_000);
    failing = false;
    expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
    expect(engine.status().state).toBe('ready');
    failing = true;
    await engine.markTyped(request);
    if (status === 500) expect(engine.status().state).toBe('ready');
    else {
      const calls = fetcher.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      await engine.markTyped(request);
      expect(fetcher).toHaveBeenCalledTimes(calls + 1);
    }
  },
);

it('reopens the monthly fuse only on the first natural request in the next UTC month', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-31T23:59:00Z'));
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 })
      : new Response('', { status: 429 }),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  await engine.markTyped(request);
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'limit-reached' });
  await vi.advanceTimersByTimeAsync(59_999);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'limit-reached' });
  fetcher.mockResolvedValue(
    Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
  );
  expect(await engine.marker()!(request)).toMatchObject({ outcome: 'correct' });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(engine.status().state).toBe('ready');
});

it('recovers a timed-out session exchange on the next natural request', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(() => new Promise<Response>(() => {}));
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  const pending = engine.markTyped(request);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toEqual({ outcome: 'unsure' });
  fetcher.mockImplementation(async (url) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
  );
  expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
  expect(engine.status().state).toBe('ready');
});

it('keeps the first two timeouts ready and pauses the third', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : new Promise<Response>(() => {}),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  for (let count = 1; count <= 3; count++) {
    const pending = engine.markTyped(request);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual({ outcome: 'unsure' });
    expect(engine.status().state).toBe(count < 3 ? 'ready' : 'paused');
  }
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
});
it('resets the failure streak on a successful abstention', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  let failing = true;
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : failing
        ? new Response('', { status: 500 })
        : Response.json({ model: 'jev-1.14.0', value: null, confidence: 0.5, inputTokens: 12 }),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  await engine.markTyped(request);
  await engine.markTyped(request);
  failing = false;
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  failing = true;
  await engine.markTyped(request);
  await engine.markTyped(request);
  expect(engine.status().state).toBe('ready');
});
it('keeps rejected access codes paused until a successful connection', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  await engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(32 * 24 * 60 * 60_000);
  engine.disable();
  engine.enable(1);
  expect(engine.marker()).toBeNull();
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(Response.json({ token: 's', expiresAt: Date.now() + 60_000 }));
  expect(await engine.connectAccessCode('new-code')).toEqual({ ok: true });
  expect(engine.status().state).toBe('ready');
});

it('keeps a failed service recovery paused with backoff before three generic failures', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  let status = 503;
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 })
      : new Response('', { status }),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  await engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(60_000);
  status = 500;
  await engine.markTyped(request);
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'service-disabled' });
  const calls = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(300_000 - 1);
  await engine.markTyped(request);
  expect(fetcher).toHaveBeenCalledTimes(calls);
});
