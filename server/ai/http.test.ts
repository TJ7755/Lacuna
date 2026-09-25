import { describe, expect, it } from 'vitest';
import { MAX_HOSTED_REQUEST_BYTES } from '../../src/ai/hostedProtocol';
import { allowedOrigin, readBoundedBody } from './http';

describe('hosted AI HTTP boundary', () => {
  it('accepts the exact web or packaged origin and rejects lookalikes', () => {
    const request = new Request('https://lacuna-beta-one.vercel.app/api/ai/inference');
    request.headers.set('Origin', 'https://lacuna-beta-one.vercel.app');
    expect(allowedOrigin(request)).toBe('https://lacuna-beta-one.vercel.app');
    request.headers.set('Origin', 'app://.');
    expect(allowedOrigin(request)).toBe('app://.');
    request.headers.set('Origin', 'https://lacuna-beta-one.vercel.app.evil.example');
    expect(allowedOrigin(request)).toBe(false);
  });

  it('rejects oversized streamed bodies even without Content-Length', async () => {
    const request = new Request('https://lacuna-beta-one.vercel.app/api/ai/inference', {
      method: 'POST',
      body: new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(MAX_HOSTED_REQUEST_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      } }),
      duplex: 'half',
    } as RequestInit);
    expect(await readBoundedBody(request)).toBeNull();
  });
});
