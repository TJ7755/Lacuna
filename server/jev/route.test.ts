import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { exchangeCredential, loadAccessConfiguration } from '../ai/access';
import route from '../../api/ai/jev';

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
afterEach(async () => {
  await Promise.all(background.tasks.splice(0));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
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
it('rejects a client-selected model and refuses at the fuse before calling TypeSafe', async () => {
  configured();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: 0 }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    (
      await route.fetch(
        request({
          state: 'x',
          instructions: 'Choose',
          options: { a: 'A', b: 'B' },
          model: 'jev-latest',
        }),
      )
    ).status,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await route.fetch(request())).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://redis.example');
});
it('records calls and actual usage in daily and monthly UTC counters independently of free chat', async () => {
  configured();
  vi.stubEnv('AI_SERVICE_DISABLED', '1');
  const fetcher = vi.fn().mockImplementation(async (url) =>
    url === 'https://redis.example'
      ? Response.json({ result: 1 })
      : Response.json({
          model: 'jev-1.14.0',
          answers: { decision: { type: 'noul', noul: 0.98 } },
          usage: { input_tokens: 123, output_tokens: 12 },
        }),
  );
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inputTokens: 123, value: 1 });
  const commands = fetcher.mock.calls
    .filter(([url]) => url === 'https://redis.example')
    .map(([, init]) => JSON.parse(init.body));
  expect(commands).toHaveLength(2);
  expect(commands[0].join(' ')).toContain('lacuna:jev:month:');
  expect(commands[1].join(' ')).toContain('lacuna:jev:day:');
  expect(commands[1]).toContain(123);
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
it('reserves and settles usage once for a batch of parallel marking questions', async () => {
  configured();
  const fetcher = vi.fn().mockImplementation(async (url, init) =>
    url === 'https://redis.example'
      ? Response.json({ result: 1 })
      : Response.json({
          model: 'jev-1.14.0',
          answers: Object.fromEntries(
            Object.keys(JSON.parse(init.body).questions).map((key) => [
              key,
              { type: 'noul', noul: 0.99 },
            ]),
          ),
          usage: { input_tokens: 150, output_tokens: 12 },
        }),
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
    inputTokens: 150,
    decisions: [{ value: 1 }, { value: 1 }],
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  const commands = fetcher.mock.calls
    .filter(([url]) => url === 'https://redis.example')
    .map(([, init]) => JSON.parse(init.body));
  expect(commands).toHaveLength(2);
  expect(commands[1]).toContain(150);
});

it('returns a validated verdict while settlement is still pending', async () => {
  configured();
  let release!: (response: Response) => void;
  let settling = false;
  const fetcher = vi.fn(async (url, init) => {
    if (url !== 'https://redis.example')
      return Response.json({
        model: 'jev-1.14.0',
        answers: { decision: { type: 'noul', noul: 0.98 } },
        usage: { input_tokens: 123, output_tokens: 12 },
      });
    if (JSON.parse(init.body)[2] === 4) return Response.json({ result: 1 });
    settling = true;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const pending = route.fetch(request());
  await vi.waitFor(() => expect(settling).toBe(true));
  try {
    const response = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
    ]);
    expect(response?.status).toBe(200);
    expect(background.tasks).toHaveLength(1);
    expect(await response!.json()).toMatchObject({ value: 1, inputTokens: 123 });
  } finally {
    release(Response.json({ result: 1 }));
    await pending;
  }
});
it('keeps the verdict successful if deferred settlement fails without releasing the reservation', async () => {
  configured();
  const fetcher = vi.fn(async (url, init) => {
    if (url !== 'https://redis.example')
      return Response.json({
        model: 'jev-1.14.0',
        answers: { decision: { type: 'noul', noul: 0.98 } },
        usage: { input_tokens: 123, output_tokens: 12 },
      });
    if (JSON.parse(init.body)[2] === 4) return Response.json({ result: 1 });
    throw new Error('Settlement unavailable');
  });
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(200);
  expect(background.tasks).toHaveLength(1);
  await Promise.all(background.tasks);
  expect(fetcher.mock.calls.filter(([url]) => url === 'https://redis.example')).toHaveLength(2);
});

it('reports reserve, TypeSafe and total durations without secrets or content', async () => {
  configured();
  let clock = 100;
  const timing = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const fetcher = vi.fn(async (url) => {
    if (url === 'https://redis.example') {
      clock += 20;
      return Response.json({ result: 1 });
    }
    clock += 190;
    return Response.json({
      model: 'jev-1.14.0',
      answers: { decision: { type: 'noul', noul: 0.98 } },
      usage: { input_tokens: 123, output_tokens: 12 },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const response = await route.fetch(request());
    expect(response.headers.get('Server-Timing')).toBe(
      'reserve;dur=20.0, typesafe;dur=190.0, total;dur=210.0',
    );
    expect(response.headers.get('Timing-Allow-Origin')).toBeNull();
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://redis.example')).toHaveLength(2);
  } finally {
    timing.mockRestore();
  }
});
it('reports elapsed timing for refused reservations without calling TypeSafe', async () => {
  configured();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: 0 }));
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(429);
  expect(response.headers.get('Server-Timing')).toMatch(
    /^reserve;dur=\d+\.\d, typesafe;dur=0\.0, total;dur=\d+\.\d$/,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
