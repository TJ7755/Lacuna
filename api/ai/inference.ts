import { loadAccessConfiguration, verifySessionToken } from '../../server/ai/access';
import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http';
import { createHostedInferenceResponse } from '../../server/ai/inference';
import { configuredFreeModels } from '../../server/ai/providers';
import { createAiQuotaStore } from '../../server/ai/quota';

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = allowedOrigin(request);
    if (origin === false) return new Response('Origin is not allowed.', { status: 403 });
    const headers = aiHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405, headers });
    if (process.env.AI_SERVICE_DISABLED === '1') return new Response('AI is unavailable.', { status: 503, headers });
    const configuration = loadAccessConfiguration(process.env);
    if (!configuration || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return new Response('AI is unavailable.', { status: 503, headers });
    }
    const bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
    const credentialId = bearer && verifySessionToken(bearer[1]!, configuration);
    if (!credentialId) return new Response('AI access has expired.', { status: 401, headers });
    const body = await readBoundedBody(request);
    if (body === null) return new Response('AI request is too large.', { status: 413, headers });
    const routes = await configuredFreeModels(process.env);
    if (routes.length === 0) return new Response('AI is unavailable.', { status: 503, headers });
    const quota = createAiQuotaStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN);
    let release: (() => Promise<void>) | null;
    try {
      release = await quota.reserve(credentialId);
    } catch {
      return new Response('AI is unavailable.', { status: 503, headers });
    }
    if (!release) return new Response('AI limit reached. Try again later.', { status: 429, headers });
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(30_000)]);
    const response = createHostedInferenceResponse(body, routes, signal);
    if (!response.ok || !response.body) {
      await release().catch(() => undefined);
      return new Response(response.body, { status: response.status, headers });
    }
    const reader = response.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            await release().catch(() => undefined);
          } else controller.enqueue(value);
        } catch {
          controller.error(new Error('AI stream was interrupted.'));
          await release().catch(() => undefined);
        }
      },
      async cancel() {
        abort.abort();
        await reader.cancel().catch(() => undefined);
        await release().catch(() => undefined);
      },
    });
    response.headers.forEach((value, name) => headers.set(name, value));
    return new Response(stream, { status: response.status, headers });
  },
};
