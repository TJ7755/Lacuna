import { describe, expect, it } from 'vitest';
import { allowedOrigin, readBoundedBody } from './http';

describe('automatic marking HTTP boundary', () => {
  it('accepts the exact web or packaged origin and rejects lookalikes', () => {
    const request = new Request('https://getlacuna.app/api/ai/session');
    request.headers.set('Origin', 'https://getlacuna.app');
    expect(allowedOrigin(request)).toBe('https://getlacuna.app');
    request.headers.set('Origin', 'app://.');
    expect(allowedOrigin(request)).toBe('app://.');
    request.headers.set('Origin', 'https://getlacuna.app.evil.example');
    expect(allowedOrigin(request)).toBe(false);
  });

  it('rejects oversized streamed bodies even without Content-Length', async () => {
    const request = new Request('https://getlacuna.app/api/ai/session', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(96 * 1024));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect(await readBoundedBody(request)).toBeNull();
  });
});
