import { afterEach, expect, it, vi } from 'vitest';
import { createHandler } from '../../../relay/src/relay';
import { MemoryStore } from '../../../relay/src/store';
import { CHANNEL_TTL_MS } from '../../../relay/src/channelMaintenance';
import { createInsightsOwner } from './envelope';
import { requestShortClassCode, resolveShortClassCode } from '../shareLinks/client';
import { getClassRecipient, getPublishedClassRecipient, publishClassRecipient } from './classKey';

afterEach(() => vi.unstubAllEnvs());
it('publishes only the public key under owner authentication and refuses a substituted recipient', async () => {
  vi.stubEnv('RELAY_MINT_SECRET', 'class-key-test');
  let now = Date.parse('2026-10-19T00:00:00Z');
  const store = new MemoryStore(() => now);
  const handle = createHandler(store, { now: () => now });
  const relayUrl = 'https://relay.example';
  const minted = await handle(
    new Request(`${relayUrl}/shares`, {
      method: 'POST',
      headers: { Authorization: 'Bearer class-key-test' },
    }),
  );
  const owner = (await minted.json()) as { shareId: string; writeToken: string };
  const keys = await createInsightsOwner('several separate teacher words offline', owner.shareId);
  const fetchImpl = vi.fn<typeof fetch>((url, init) => {
    const request = new Request(url, init);
    if (init?.body instanceof Blob) request.headers.set('Content-Length', String(init.body.size));
    return handle(request);
  });
  const options = { relayUrl, ...owner, fetchImpl };
  await expect(
    publishClassRecipient({ ...options, writeToken: '0'.repeat(64), recipient: keys.recipient }),
  ).rejects.toThrow();
  await publishClassRecipient({ ...options, recipient: keys.recipient });
  await publishClassRecipient({ ...options, recipient: keys.recipient });
  expect(await getClassRecipient({ ...options, keyId: keys.recipient.keyId })).toEqual(
    keys.recipient,
  );
  const code = await requestShortClassCode(options);
  expect(await requestShortClassCode(options)).toBe(code);
  const resolvedId = await resolveShortClassCode({ ...options, code });
  expect(resolvedId).toBe(owner.shareId);
  expect(await getPublishedClassRecipient({ ...options, shareId: resolvedId })).toEqual(
    keys.recipient,
  );
  const stored = new TextDecoder().decode(
    (await store.get(`shares/${owner.shareId}/teacher`))!.body,
  );
  expect(stored).not.toContain('privateKey');
  expect(stored).not.toContain('recovery');
  const other = await createInsightsOwner('another separate teacher words offline', owner.shareId);
  await expect(publishClassRecipient({ ...options, recipient: other.recipient })).rejects.toThrow(
    /different/,
  );
  await expect(getClassRecipient({ ...options, keyId: other.recipient.keyId })).rejects.toThrow(
    /match/,
  );
  now += CHANNEL_TTL_MS;
  await expect(getClassRecipient({ ...options, keyId: keys.recipient.keyId })).rejects.toThrow();
});
