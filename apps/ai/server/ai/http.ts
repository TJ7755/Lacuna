import { MAX_HOSTED_REQUEST_BYTES } from '../../../web/src/ai/hostedProtocol.js';

export function allowedOrigin(request: Request): string | null | false {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin === new URL(request.url).origin || origin === 'app://.') return origin;
  return false;
}

/**
 * The caller's address for rate limiting. On Vercel only its edge-set header is trusted,
 * as in relay/src/rateLimit.ts; elsewhere the operator's front proxy sets X-Forwarded-For.
 */
export function clientAddress(request: Request): string {
  const first = (value: string | null) => value?.split(',')[0]?.trim().toLowerCase() || null;
  const vercel = first(request.headers.get('x-vercel-forwarded-for'));
  if (vercel) return vercel;
  if (process.env.VERCEL) return 'unknown';
  return (
    first(request.headers.get('x-forwarded-for')) ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'
  );
}

export function aiHeaders(origin: string | null): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'Retry-After, X-Lacuna-AI-Limit');
  }
  return headers;
}

export async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HOSTED_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
