import { MAX_HOSTED_REQUEST_BYTES } from '../../src/ai/hostedProtocol.js';

export function allowedOrigin(request: Request): string | null | false {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin === new URL(request.url).origin || origin === 'app://.') return origin;
  return false;
}

export function aiHeaders(origin: string | null): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
