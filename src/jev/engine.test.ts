import { afterEach, expect, it, vi } from 'vitest';
import { createJevEngine } from './engine';
import { JEV_CONSENT_VERSION } from './index';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';

const emptyCache = () => ({ get: vi.fn(async () => undefined), put: vi.fn(async () => {}) });
const request = { cardId: 'c', prompt: 'What?', expected: 'Water', answer: 'Water molecules' };

it.each([
  { answer: 'Facts only', confidence: 0.6, outcome: 'insufficient-evidence', invalid: false },
  { answer: 'Facts only', confidence: 0.85, outcome: 'gap', invalid: false },
  { answer: '  ', confidence: 0.99, outcome: 'insufficient-evidence', invalid: false },
  { answer: 'Facts only', confidence: 0.99, outcome: null, invalid: true },
])(
  'validates diagnostic confidence and categories independently of marks: %j',
  async ({ answer, confidence, outcome, invalid }) => {
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    const fetcher = vi.fn(async (url) =>
      url.endsWith('/session')
        ? Response.json({ token: 'session', expiresAt: Date.now() + 60_000 })
        : Response.json({
            model: 'jev-1.14.0',
            inputTokens: 50,
            decisions: [
              {
                value: 1,
                confidence: 0.99,
                model: 'jev-1.14.0',
                diagnosis: {
                  taxonomyId: 'science-explanations',
                  taxonomyVersion: 1,
                  decisions: ['knowledge', 'application', invalid ? 'invented' : 'causal-link'].map(
                    (categoryId) => ({
                      categoryId,
                      outcome: 'gap',
                      confidence,
                    }),
                  ),
                },
              },
            ],
          }),
    );
    const engine = createJevEngine({ fetcher, cache: emptyCache() });
    engine.enable(1);
    const result = await engine.decideAllocations([
      {
        prompt: 'Explain',
        criterion: 'A scientific mechanism',
        explanation: '',
        maxMarks: 1,
        answer,
        diagnostic: {
          taxonomyId: 'science-explanations',
          taxonomyVersion: 1,
          techniqueIds: ['causal-link'],
        },
      },
    ]);
    if (invalid) expect(result).toBeNull();
    else {
      expect(result![0].value).toBe(1);
      expect(result![0].diagnosis!.decisions.every((row) => row.outcome === outcome)).toBe(true);
    }
  },
);
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
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
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
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
  expect(await pending).toEqual({ outcome: 'unsure', feedback: null });
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
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
  expect(engine.status()).toMatchObject({ state: 'paused', reason });
});
it('resolves one hung request within the typed timeout without pausing', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const engine = createJevEngine({ fetcher: vi.fn(() => new Promise<Response>(() => {})) });
  engine.enable(1);
  const result = engine.markTyped(request);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toEqual({ outcome: 'unsure', feedback: null });
  expect(engine.status()).toMatchObject({ state: 'ready' });
});
it('abstains on low confidence without pausing', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ token: 's', expiresAt: Date.now() + 60_000 }))
    .mockResolvedValueOnce(
      Response.json({ model: 'jev-1.14.0', value: null, confidence: 0.74, inputTokens: 12 }),
    );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
  expect(engine.status().state).toBe('ready');
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
  expect(await pending).toEqual({ outcome: 'unsure', feedback: null });
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
      get: async () => ({ model: 'jev-1.14.0', value: 1, confidence: 0.74, inputTokens: 12 }),
      put: async () => {},
    },
  });
  engine.enable(1);
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [1, 0.7499, 'unsure'],
  [1, 0.75, 'correct'],
  [1, 0.79, 'correct'],
  [0, 0.7499, 'unsure'],
  [0, 0.75, 'incorrect'],
  [0, 0.79, 'incorrect'],
] as const)(
  'applies the typed threshold to cached value %s at confidence %s',
  async (value, confidence, outcome) => {
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    const fetcher = vi.fn();
    const engine = createJevEngine({
      fetcher,
      cache: {
        get: async () => ({ model: 'jev-1.14.0', value, confidence, inputTokens: 12 }),
        put: async () => {},
      },
    });
    engine.enable(1);
    expect(await engine.markTyped(request)).toMatchObject({ outcome });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
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
    expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
    expect(engine.status().state).toBe('ready');
  }
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
  expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each(['marking', 'session exchange'])(
  'retries transient %s network failures without an online event',
  async (stage) => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    let failing = true;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const isSession = String(url).endsWith('/session');
      if (failing && (stage === 'session exchange' ? isSession : !isSession))
        throw new TypeError('Failed to fetch');
      if (isSession) return Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 });
      return Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 });
    });
    const engine = createJevEngine({ fetcher, cache: emptyCache() });
    engine.enable(1);
    for (let count = 1; count <= 3; count++) {
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      if (count < 3) expect(engine.status().state).toBe('ready');
    }
    expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
    for (const delay of [60_000, 300_000, 900_000, 900_000]) {
      const calls = fetcher.mock.calls.length;
      expect(engine.marker()).toBeNull();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      expect(fetcher).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).toHaveBeenCalledTimes(calls);
      expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      expect(fetcher).toHaveBeenCalledTimes(calls + 1);
      expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
    }
    failing = false;
    const calls = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(900_000);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
    expect(await engine.marker()!(request)).toMatchObject({ outcome: 'correct' });
    expect(engine.status().state).toBe('ready');
    if (stage === 'session exchange') await vi.advanceTimersByTimeAsync(3_600_000);
    failing = true;
    for (let count = 1; count <= 3; count++) {
      await engine.markTyped(request);
      if (count < 3) expect(engine.status().state).toBe('ready');
    }
    expect(engine.status()).toMatchObject({ state: 'paused', reason: 'error' });
    failing = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
  },
);

it.each(['marking', 'session exchange'])(
  'waits for an online event after the browser goes offline during %s',
  async (stage) => {
    vi.useFakeTimers();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    let failing = true;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const isSession = String(url).endsWith('/session');
      if (failing && (stage === 'session exchange' ? isSession : !isSession)) {
        online.mockReturnValue(false);
        throw new TypeError('Failed to fetch');
      }
      if (isSession) return Response.json({ token: 's', expiresAt: Date.now() + 3_600_000 });
      return Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 });
    });
    const engine = createJevEngine({ fetcher, cache: emptyCache() });
    const unsubscribe = engine.subscribe(() => {});
    try {
      engine.enable(1);
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      expect(engine.status()).toMatchObject({ state: 'paused', reason: 'offline' });
      failing = false;
      const calls = fetcher.mock.calls.length;
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      expect(fetcher).toHaveBeenCalledTimes(calls);
      online.mockReturnValue(true);
      expect(engine.marker()).toBeNull();
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      expect(engine.status()).toMatchObject({ state: 'paused', reason: 'offline' });
      expect(fetcher).toHaveBeenCalledTimes(calls);
      globalThis.dispatchEvent(new Event('online'));
      expect(fetcher).toHaveBeenCalledTimes(calls);
      expect(engine.status().state).toBe('ready');
      expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
    } finally {
      unsubscribe();
    }
  },
);

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
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
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
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
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

it.each([false, true])(
  'recovers an abandoned session exchange when the caller aborts: %s',
  async (callerAborts) => {
    vi.useFakeTimers();
    localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const engine = createJevEngine({ fetcher, cache: emptyCache() });
    engine.enable(1);
    const controller = new AbortController();
    const pending = engine.markTyped({ ...request, signal: controller.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    if (callerAborts) controller.abort();
    else await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual({ outcome: 'unsure', feedback: null });
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/session')
        ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
        : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
    );
    expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
    expect(engine.status().state).toBe('ready');
  },
);

it('never counts typed timeouts as failures, even after repeated slow answers', async () => {
  vi.useFakeTimers();
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : new Promise<Response>(() => {}),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  for (let count = 1; count <= 5; count++) {
    const pending = engine.markTyped(request);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual({ outcome: 'unsure', feedback: null });
    expect(engine.status().state).toBe('ready');
  }
  expect(engine.marker()).not.toBeNull();
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
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
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
  expect(await engine.markTyped(request)).toEqual({ outcome: 'unsure', feedback: null });
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

it('warms one session when the eligible marker is requested and shares it with the first answer', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  let resolveSession!: (response: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    )
    .mockResolvedValue(
      Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
    );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  const marker = engine.marker()!;
  engine.marker();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/ai/session');
  const pending = marker(request);
  resolveSession(Response.json({ token: 's', expiresAt: Date.now() + 60_000 }));
  expect(await pending).toMatchObject({ outcome: 'correct' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  engine.marker();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not retry failed session warming on renders or pause marking', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  engine.marker();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  engine.marker();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(engine.status().state).toBe('ready');
  fetcher.mockImplementation(async (url) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : Response.json({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 12 }),
  );
  expect(await engine.markTyped(request)).toMatchObject({ outcome: 'correct' });
});

it.each([
  [401, 'That access code was not recognised.'],
  [503, 'Automatic marking is unavailable right now. Try again later.'],
  [400, 'Automatic marking is unavailable right now. Try again later.'],
  [429, 'Too many attempts. Try again later.'],
  [0, 'Could not reach Lacuna. Check your connection.'],
])('uses marking-specific connection errors for status %s', async (status, message) => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (!status) throw new Error('offline');
    return new Response('', { status });
  });
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  expect(await engine.connectAccessCode('code')).toEqual({ ok: false, message });
});

it.each([
  [1, 'correct'],
  [0, 'incorrect'],
  [null, 'unsure'],
] as const)('preserves successful typed feedback for value %s', async (value, outcome) => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const feedback = {
    kind: 'partial',
    parts: [
      { start: 0, end: 5, covered: true },
      { start: 10, end: 17, covered: false },
    ],
  };
  const fetcher = vi.fn(async (url) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : Response.json({
          model: 'jev-1.14.0',
          value,
          confidence: value === null ? 0.5 : 0.97,
          inputTokens: 12,
          feedback,
        }),
  );
  const engine = createJevEngine({ fetcher, cache: emptyCache() });
  engine.enable(1);
  expect(await engine.markTyped({ ...request, expected: 'Water and glucose' })).toMatchObject({
    outcome,
    feedback,
  });
});
it('reuses a successful unsure verdict and its feedback without another request', async () => {
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'code');
  const feedback = {
    kind: 'partial',
    parts: [
      { start: 0, end: 5, covered: true },
      { start: 10, end: 17, covered: null },
    ],
  };
  const fetcher = vi.fn(async (url) =>
    String(url).endsWith('/session')
      ? Response.json({ token: 's', expiresAt: Date.now() + 60_000 })
      : Response.json({
          model: 'jev-1.14.0',
          value: null,
          confidence: 0.5,
          inputTokens: 12,
          feedback,
        }),
  );
  const engine = createJevEngine({ fetcher });
  engine.enable(1);
  const answer = { ...request, prompt: 'Feedback reuse fixture', expected: 'Water and glucose' };
  expect(await engine.markTyped(answer)).toEqual({ outcome: 'unsure', feedback });
  expect(await engine.markTyped(answer)).toEqual({ outcome: 'unsure', feedback });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
