import { exchangeCredential, loadAccessConfiguration } from '../../server/ai/access.js';
import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = allowedOrigin(request);
    if (origin === false) return new Response('Origin is not allowed.', { status: 403 });
    const headers = aiHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405, headers });
    if (process.env.AI_SERVICE_DISABLED === '1') return new Response('AI is unavailable.', { status: 503, headers });
    const configuration = loadAccessConfiguration(process.env);
    if (!configuration) return new Response('AI is unavailable.', { status: 503, headers });
    const body = await readBoundedBody(request);
    if (body === null) return new Response('AI request is too large.', { status: 413, headers });
    let credential: unknown;
    try {
      credential = body ? (JSON.parse(body) as { credential?: unknown }).credential : null;
    } catch {
      return new Response('Invalid request.', { status: 400, headers });
    }
    if (typeof credential !== 'string') return new Response('Invalid request.', { status: 400, headers });
    const session = exchangeCredential(credential, configuration);
    if (!session) return new Response('Access code is invalid or revoked.', { status: 401, headers });
    return Response.json(session, { headers });
  },
};
