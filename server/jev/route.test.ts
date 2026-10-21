import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { exchangeCredential, loadAccessConfiguration } from '../ai/access';
import type routeHandler from '../../api/ai/jev';
let route: typeof routeHandler;

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock('@vercel/functions', () => ({
  waitUntil: (task: Promise<unknown>) => {
    background.tasks.push(task);
  },
}));

const credential = 'a'.repeat(40);
function configured() {
  vi.stubEnv(
    'AI_ACCESS_CREDENTIAL_HASHES',
    JSON.stringify({ tester: createHash('sha256').update(credential).digest('hex') }),
  );
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
  const token = exchangeCredential(credential, loadAccessConfiguration(process.env)!)!.token;
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
        (question as { type: string }).type === 'choice'
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

it('refuses only once its background-refreshed monthly total exceeds the fuse', async () => {
  configured();
  const fetcher = vi.fn(async (url, init) =>
    url === 'https://redis.example'
      ? Response.json({ result: JSON.parse(init.body)[0] === 'GET' ? '50000001' : 1 })
      : providerResponse(init),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(
    (
      await route.fetch(
        request({
          purpose: 'typed-equivalence',
          prompt: 'Q',
          expected: 'A',
          answer: 'A',
          model: 'jev-latest',
        }),
      )
    ).status,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await route.fetch(request())).status).toBe(200);
  await Promise.all(background.tasks);
  const calls = fetcher.mock.calls.length;
  expect((await route.fetch(request())).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('records calls and actual usage after the response, independently of free chat', async () => {
  configured();
  vi.stubEnv('AI_SERVICE_DISABLED', '1');
  const fetcher = vi.fn(async (url, init) =>
    url === 'https://redis.example'
      ? Response.json({ result: JSON.parse(init.body)[0] === 'GET' ? null : 1 })
      : providerResponse(init),
  );
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inputTokens: 123, value: 1 });
  await Promise.all(background.tasks);
  const commands = fetcher.mock.calls
    .filter(([url]) => url === 'https://redis.example')
    .map(([, init]) => JSON.parse(init.body));
  expect(commands).toHaveLength(2);
  expect(commands[0][0]).toBe('GET');
  expect(commands[1][0]).toBe('EVAL');
  expect(commands[1].join(' ')).toContain('lacuna:jev:month:');
  expect(commands[1].join(' ')).toContain('lacuna:jev:day:');
  expect(commands[1]).toContain(123);
});
it('returns a validated verdict while every Redis request is still pending', async () => {
  configured();
  let released = false;
  const releases: Array<(response: Response) => void> = [];
  const fetcher = vi.fn(async (url, init) => {
    if (url !== 'https://redis.example') return providerResponse(init);
    if (released) return Response.json({ result: 0 });
    return new Promise<Response>((resolve) => {
      releases.push(resolve);
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const pending = route.fetch(request());
  try {
    await vi.waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url !== 'https://redis.example')).toBe(true),
    );
    const response = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
    ]);
    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({ value: 1 });
    expect(background.tasks).toHaveLength(2);
  } finally {
    released = true;
    releases.forEach((resolve) => resolve(Response.json({ result: 0 })));
    await pending;
  }
});
it('keeps marking available when Redis background work fails', async () => {
  configured();
  const fetcher = vi.fn(async (url, init) => {
    if (url === 'https://redis.example') throw new Error('Redis offline');
    return providerResponse(init);
  });
  vi.stubGlobal('fetch', fetcher);
  expect((await route.fetch(request())).status).toBe(200);
  await Promise.all(background.tasks);
  expect((await route.fetch(request())).status).toBe(200);
  expect(fetcher.mock.calls.filter(([, init]) => JSON.parse(init.body)[0] === 'GET')).toHaveLength(
    1,
  );
});
it('reports TypeSafe and total handler timings without settlement or secrets', async () => {
  configured();
  let clock = 100;
  const timing = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const fetcher = vi.fn(async (url, init) => {
    if (url === 'https://redis.example') {
      if (JSON.parse(init.body)[0] === 'EVAL') clock += 20;
      return Response.json({ result: 0 });
    }
    clock += 190;
    return providerResponse(init);
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const response = await route.fetch(request());
    expect(response.headers.get('Server-Timing')).toBe('typesafe;dur=190.0, total;dur=190.0');
    expect(response.headers.get('Timing-Allow-Origin')).toBeNull();
  } finally {
    timing.mockRestore();
  }
});
it('batches all allocation questions into one TypeSafe call and one counter write', async () => {
  configured();
  const fetcher = vi.fn(async (url, init) =>
    url === 'https://redis.example' ? Response.json({ result: 0 }) : providerResponse(init),
  );
  vi.stubGlobal('fetch', fetcher);
  const allocation = {
    prompt: 'Q',
    criterion: 'Water',
    explanation: '',
    maxMarks: 1,
    answer: 'Water',
  };
  const response = await route.fetch(
    request({
      purpose: 'mark-allocation',
      allocations: [allocation, { ...allocation, criterion: 'Membrane' }],
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    inputTokens: 123,
    decisions: [{ value: 1 }, { value: 1 }],
  });
  await Promise.all(background.tasks);
  expect(fetcher.mock.calls.filter(([url]) => url !== 'https://redis.example')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([, init]) => JSON.parse(init.body)[0] === 'EVAL')).toHaveLength(
    1,
  );
});
