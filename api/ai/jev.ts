import { loadAccessConfiguration, verifySessionToken } from '../../server/ai/access.js';
import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http.js';
import { callJevDecision, callJevAllocationBatch } from '../../server/jev/provider.js';
import { createJevUsageStore, loadJevLimit } from '../../server/jev/usage.js';
import { jevMarkRequestSchema } from '../../src/jev/protocol.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const started = performance.now();
    const timings = { reserve: 0, typesafe: 0 };
    const measure = async <T>(part: keyof typeof timings, work: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      try {
        return await work();
      } finally {
        timings[part] = performance.now() - start;
      }
    };
    const finish = (response: Response) => {
      response.headers.set(
        'Server-Timing',
        `reserve;dur=${timings.reserve.toFixed(1)}, typesafe;dur=${timings.typesafe.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`,
      );
      return response;
    };
    const origin = allowedOrigin(request);
    const headers = aiHeaders(origin === false ? null : origin);
    const error = (status: number, message: string) =>
      finish(new Response(message, { status, headers }));
    if (origin === false) return error(403, 'Origin is not allowed.');
    if (request.method === 'OPTIONS') return finish(new Response(null, { status: 204, headers }));
    if (request.method !== 'POST') return error(405, 'Method not allowed.');
    const access = loadAccessConfiguration(process.env);
    const key = process.env.TYPESAFE_API_KEY?.trim();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const limit = loadJevLimit(process.env.JEV_MONTHLY_INPUT_TOKEN_LIMIT);
    if (
      process.env.JEV_SERVICE_DISABLED === '1' ||
      !access ||
      !key ||
      !url ||
      !token ||
      limit === null
    )
      return error(503, 'Jev is unavailable.');
    if (
      !verifySessionToken(
        request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
        access,
      )
    )
      return error(401, 'Access code is invalid or revoked.');
    const body = await readBoundedBody(request);
    if (body === null) return error(413, 'Jev request is too large.');
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return error(400, 'Invalid request.');
    }
    const parsed = jevMarkRequestSchema.safeParse(value);
    if (!parsed.success) return error(400, 'Invalid request.');
    try {
      const settle = await measure('reserve', () => createJevUsageStore(url, token).reserve(limit));
      if (!settle) return error(429, 'Jev input-token ceiling reached.');
      // Do not release on transport failure: the provider may already have charged for it.
      // Unsettled reservations remain charged against this month's fuse, never expiring mid-call.
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
      const result = await measure('typesafe', async () =>
        'allocations' in parsed.data
          ? await callJevAllocationBatch(parsed.data, key, signal)
          : await callJevDecision(parsed.data, key, signal),
      );
      const response = finish(Response.json(result, { headers }));
      // Failed settlement retains the conservative reservation; never delay a valid verdict for it.
      waitUntil(settle(result.inputTokens).catch(() => {}));
      return response;
    } catch {
      return error(503, 'Jev is unavailable.');
    }
  },
};
import { waitUntil } from '@vercel/functions';
