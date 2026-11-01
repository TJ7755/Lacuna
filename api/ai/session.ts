import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http.js';
import { createJevSession, jevInstallationId, loadJevSigningKey } from '../../server/jev/access.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = allowedOrigin(request);
    if (origin === false) return new Response('Origin is not allowed.', { status: 403 });
    const headers = aiHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return new Response('Method not allowed.', { status: 405, headers });
    const key = loadJevSigningKey(process.env);
    if (!key || process.env.JEV_SERVICE_DISABLED === '1' || process.env.AI_SERVICE_DISABLED === '1')
      return new Response('Jev is unavailable.', { status: 503, headers });
    const body = await readBoundedBody(request);
    if (body === null) return new Response('Jev request is too large.', { status: 413, headers });
    let credential: unknown;
    try {
      const value: unknown = JSON.parse(body);
      credential =
        value && typeof value === 'object' ? (value as { credential?: unknown }).credential : null;
    } catch {
      return new Response('Invalid request.', { status: 400, headers });
    }
    const id = jevInstallationId(credential);
    if (!id) return new Response('Invalid installation credential.', { status: 400, headers });
    return Response.json(createJevSession(id, key), { headers });
  },
};
