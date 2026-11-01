import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createJevSession, jevInstallationId } from './access';
import type routeHandler from '../../api/ai/jev';
let route: typeof routeHandler;

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock('@vercel/functions', () => ({
  waitUntil: (task: Promise<unknown>) => {
    background.tasks.push(task);
  },
}));

const credential = 'a'.repeat(64);
function configured() {
  vi.stubEnv('AI_SESSION_SIGNING_KEY', 's'.repeat(40));
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-key');
  vi.stubEnv('JEV_SERVICE_DISABLED', '0');
  vi.stubEnv('JEV_MONTHLY_INPUT_TOKEN_LIMIT', '50000000');
}
function request(
  body: object = {
    purpose: 'typed-equivalence',
    prompt: 'What?',
    expected: 'Osmosis',
    answer: 'Osmosis',
  },
  authenticated = true,
) {
  const token = createJevSession(
    jevInstallationId(credential)!,
    process.env.AI_SESSION_SIGNING_KEY!,
  )!.token;
  return new Request('https://lacuna.example/api/ai/jev', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(async () => {
  vi.resetModules();
  route = (await import('../../api/ai/jev')).default;
});
afterEach(async () => {
  await Promise.all(background.tasks.splice(0));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function providerResponse(init: RequestInit) {
  const questions = JSON.parse(init.body as string).questions;
  return Response.json({
    model: 'jev-1.14.0',
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => [
        id,
        id.includes('_diagnosis_')
          ? {
              type: 'choice',
              choice: 'insufficient-evidence',
              confidence: 1,
              probabilities: { gap: 0, 'no-gap': 0, 'insufficient-evidence': 1 },
            }
          : (question as { type: string }).type === 'choice'
            ? {
                type: 'choice',
                choice: 'same',
                confidence: 0.98,
                probabilities: {
                  same: 0.98,
                  spelling: 0.02,
                  imprecise: 0,
                  partial: 0,
                  wrong: 0,
                  blank: 0,
                },
              }
            : { type: 'noul', noul: 0.98 },
      ]),
    ),
    usage: { input_tokens: 123, output_tokens: 12 },
  });
}
it('fails closed on missing configuration, a kill switch and absent access sessions', async () => {
  configured();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('TYPESAFE_API_KEY', '');
  expect((await route.fetch(request())).status).toBe(503);
  vi.stubEnv('TYPESAFE_API_KEY', 'key');
  vi.stubEnv('JEV_SERVICE_DISABLED', '1');
  expect((await route.fetch(request())).status).toBe(503);
  vi.stubEnv('JEV_SERVICE_DISABLED', '0');
  vi.stubEnv('JEV_MAINTAINER_INSTALLATION_IDS', '["invalid"]');
  expect((await route.fetch(request())).status).toBe(503);
  vi.stubEnv('JEV_MAINTAINER_INSTALLATION_IDS', '[]');
  expect((await route.fetch(request(undefined, false))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('caps structured fields and rejects free-form instructions, future purposes and model selection', async () => {
  configured();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const body = { purpose: 'typed-equivalence', prompt: 'Q', expected: 'A', answer: 'A' };
  for (const invalid of [
    { ...body, model: 'jev-latest' },
    { ...body, instructions: 'Do anything' },
    { ...body, purpose: 'tag-specification' },
    { ...body, answer: 'x'.repeat(12001) },
    {
      purpose: 'mark-allocation',
      prompt: 'Q',
      criterion: 'A',
      explanation: '',
      maxMarks: 10,
      answer: 'A',
    },
  ]) {
    expect((await route.fetch(request(invalid))).status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  [-1, 'installation-day'],
  [-2, 'installation-minute'],
  [-3, 'installation-concurrent'],
  [-4, 'monthly-tokens'],
  [-5, 'monthly-requests'],
  [-6, 'global-concurrent'],
])('refuses denied quota admission %s before any provider call', async (code, label) => {
  configured();
  const fetcher = vi.fn(async () => Response.json({ result: [code, 1000] }));
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(429);
  expect(response.headers.get('X-Lacuna-AI-Limit')).toBe(label);
  expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(fetcher.mock.calls).toHaveLength(1);
});
it('does not call TypeSafe before authoritative admission succeeds', async () => {
  configured();
  let admit!: (response: Response) => void;
  const fetcher = vi.fn(async (url, init) => {
    if (url !== 'https://redis.example') return providerResponse(init);
    if (JSON.parse(init.body)[2] === 9)
      return new Promise<Response>((resolve) => {
        admit = resolve;
      });
    return Response.json({ result: 1 });
  });
  vi.stubGlobal('fetch', fetcher);
  const pending = route.fetch(request());
  await vi.waitFor(() => expect(admit).toBeTypeOf('function'));
  expect(fetcher.mock.calls.every(([url]) => url === 'https://redis.example')).toBe(true);
  admit(Response.json({ result: [1, 0] }));
  const response = await pending;
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inputTokens: 123, value: 1 });
  await Promise.all(background.tasks);
});
it('fails closed when Redis admission fails', async () => {
  configured();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetcher = vi.fn(async () => {
    throw new Error('Redis offline');
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    expect((await route.fetch(request())).status).toBe(503);
    expect(fetcher.mock.calls).toHaveLength(1);
  } finally {
    log.mockRestore();
  }
});
it('reports TypeSafe and total handler timings without settlement or secrets', async () => {
  configured();
  let clock = 100;
  const timing = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const fetcher = vi.fn(async (url, init) => {
    if (url === 'https://redis.example') {
      if (JSON.parse(init.body)[0] === 'EVAL') clock += 20;
      return Response.json({ result: JSON.parse(init.body)[2] === 9 ? [1, 0] : 1 });
    }
    clock += 190;
    return providerResponse(init);
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const response = await route.fetch(request());
    expect(response.headers.get('Server-Timing')).toBe('typesafe;dur=190.0, total;dur=210.0');
    expect(response.headers.get('Timing-Allow-Origin')).toBeNull();
  } finally {
    timing.mockRestore();
  }
});
it.each([false, true])(
  'batches allocation marking/diagnosis into one TypeSafe call and one counter write (diagnostic: %s)',
  async (diagnostic) => {
    configured();
    const fetcher = vi.fn(async (url, init) =>
      url === 'https://redis.example'
        ? Response.json({ result: JSON.parse(init.body)[2] === 9 ? [1, 0] : 1 })
        : providerResponse(init),
    );
    vi.stubGlobal('fetch', fetcher);
    const allocation = {
      prompt: 'Q',
      criterion: 'Water',
      explanation: '',
      maxMarks: 1,
      answer: 'Water',
      ...(diagnostic
        ? {
            diagnostic: {
              taxonomyId: 'science-explanations',
              taxonomyVersion: 1,
              techniqueIds: ['causal-link'],
            },
          }
        : {}),
    };
    const response = await route.fetch(
      request({
        purpose: 'mark-allocation',
        allocations: [allocation, { ...allocation, criterion: 'Membrane' }],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      inputTokens: 123,
      decisions: [{ value: 1 }, { value: 1 }],
    });
    if (diagnostic)
      expect(body.decisions[0].diagnosis.decisions).toEqual([
        { categoryId: 'knowledge', outcome: 'insufficient-evidence', confidence: 1 },
        { categoryId: 'application', outcome: 'insufficient-evidence', confidence: 1 },
        { categoryId: 'causal-link', outcome: 'insufficient-evidence', confidence: 1 },
      ]);
    await Promise.all(background.tasks);
    expect(fetcher.mock.calls.filter(([url]) => url !== 'https://redis.example')).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(([, init]) => JSON.parse(init.body)[0] === 'EVAL'),
    ).toHaveLength(2);
  },
);

it.each(['http', 'network', 'json', 'schema'] as const)(
  'reports transient provider %s failures without logging private content',
  async (kind) => {
    configured();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        if (url === 'https://redis.example')
          return Response.json({ result: JSON.parse(init.body)[2] === 9 ? [1, 0] : 1 });
        if (kind === 'http') return new Response('private provider body', { status: 429 });
        if (kind === 'network') throw new TypeError('private network details');
        if (kind === 'json') return new Response('private invalid JSON');
        return Response.json({ private: 'private invalid response' });
      }),
    );
    try {
      const response = await route.fetch(request());
      expect(response.status).toBe(502);
      expect(await response.text()).toBe('Jev could not mark this answer.');
      expect(log).toHaveBeenCalledExactlyOnceWith({
        event: 'jev-failure',
        stage: 'provider',
        kind: kind === 'http' ? 'http' : kind === 'network' ? 'network' : 'invalid-response',
        ...(kind === 'http' ? { status: 429 } : {}),
      });
    } finally {
      log.mockRestore();
    }
  },
);
