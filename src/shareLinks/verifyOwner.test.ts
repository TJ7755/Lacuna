import { afterEach, expect, it, vi } from 'vitest';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { ShareLinkError, verifyShareOwner } from './client';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const options = {
  relayUrl: 'https://relay.example',
  shareId: 'a'.repeat(32),
  writeToken: 'b'.repeat(64),
};

it('verifies the real relay credential using only an uncached HEAD and bearer header', async () => {
  vi.stubEnv('RELAY_MINT_SECRET', 'owner-check-test');
  const store = new MemoryStore();
  const handle = createHandler(store);
  const minted = await handle(
    new Request(`${options.relayUrl}/shares`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-check-test' },
    }),
  );
  const owner = (await minted.json()) as { shareId: string; writeToken: string };
  const put = vi.spyOn(store, 'put'),
    del = vi.spyOn(store, 'del');
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => handle(new Request(url, init)));
  await verifyShareOwner({ ...options, ...owner, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith(
    `${options.relayUrl}/shares/${owner.shareId}`,
    expect.objectContaining({
      method: 'HEAD',
      headers: { Authorization: `Bearer ${owner.writeToken}` },
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    }),
  );
  expect(String(fetchImpl.mock.calls[0][0])).not.toContain(owner.writeToken);
  expect(put).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
});

it.each([200, 401, 404, 410, 429, 503])(
  'refuses HTTP %i instead of claiming verified ownership',
  async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    await expect(verifyShareOwner({ ...options, fetchImpl })).rejects.toMatchObject({
      name: 'ShareLinkError',
      operation: 'verify',
      status,
    });
  },
);

it('validates the destination and capability before sending', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const changed of [
    { shareId: 'bad' },
    { writeToken: 'short' },
    { relayUrl: 'https://relay.example/?token=private' },
  ]) {
    await expect(verifyShareOwner({ ...options, ...changed, fetchImpl })).rejects.toBeInstanceOf(
      ShareLinkError,
    );
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('replaces network errors that might contain credentials', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    throw new Error(options.writeToken);
  });
  await expect(verifyShareOwner({ ...options, fetchImpl })).rejects.toMatchObject({
    name: 'ShareLinkError',
    operation: 'verify',
    message: 'Could not reach the share link service. Check your connection and try again.',
  });
});

it('times out and supports cancellation', async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn<typeof fetch>(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }),
  );
  const timed = expect(verifyShareOwner({ ...options, fetchImpl })).rejects.toThrow(
    'Could not reach',
  );
  await vi.advanceTimersByTimeAsync(15_000);
  await timed;
  expect(signals[0].aborted).toBe(true);
  const controller = new AbortController();
  const cancelled = verifyShareOwner({ ...options, fetchImpl, signal: controller.signal });
  controller.abort();
  await expect(cancelled).rejects.toThrow('Could not reach');
  expect(signals[1].aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
