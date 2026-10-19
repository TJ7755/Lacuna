import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { createInsightsOwner, openInsightEnvelope, type InsightsOwner } from './envelope';
import { getInsightMailboxPage } from './mailbox';
import { createInsightsOutbox } from './outbox';

const shareId = 'a'.repeat(32);
const relayUrl = 'https://relay.example';
const evidence = new TextEncoder().encode('pupil-17 question-4 criterion-2 marks 3/5');
let owner: InsightsOwner;
let clock: number;
let databaseName: string;
let outboxes: ReturnType<typeof createInsightsOutbox>[];

beforeAll(async () => {
  owner = await createInsightsOwner('a teacher keeps a long recovery phrase offline', shareId);
}, 30_000);
beforeEach(() => {
  clock = Date.parse('2026-10-19T12:00:00Z');
  databaseName = `insights-outbox-test-${crypto.randomUUID()}`;
  outboxes = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const outbox of outboxes) outbox.close();
  await Dexie.delete(databaseName);
});

function openOutbox() {
  const outbox = createInsightsOutbox(databaseName, () => clock);
  outboxes.push(outbox);
  return outbox;
}

function options() {
  return {
    shareId,
    relayUrl,
    recipient: owner.recipient,
    evidence: vi.fn(async () => evidence),
    isOptedIn: () => true,
    fetchImpl: vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
  };
}

async function inspect() {
  const database = new Dexie(databaseName);
  try {
    await database.open();
    return await database.table('packets').toArray();
  } finally {
    database.close();
  }
}

describe('durable encrypted daily delivery', () => {
  it('reopens after a lost reply, retries the same relay slot and keeps a durable acknowledgement', async () => {
    vi.stubEnv('RELAY_INSIGHTS_ENABLED', '1');
    const store = new MemoryStore(() => clock);
    const handler = createHandler(store, { now: () => clock });
    const created = await handler(new Request(`${relayUrl}/shares`, { method: 'POST' }));
    const credentials = (await created.json()) as { shareId: string; writeToken: string };
    let loseReply = true;
    const requests: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const request = new Request(url, init);
      if (typeof init?.body === 'string') {
        request.headers.set('Content-Length', String(new TextEncoder().encode(init.body).length));
        requests.push({ url: request.url, body: init.body });
      }
      const response = await handler(request);
      if (request.method === 'PUT' && loseReply) {
        loseReply = false;
        expect(response.status).toBe(204);
        throw new TypeError('Reply lost after the relay accepted it');
      }
      return response;
    });
    const input = { ...options(), shareId: credentials.shareId, fetchImpl };
    const first = openOutbox();
    await expect(first.send(input)).rejects.toThrow('Could not reach');
    const saved = (await inspect())[0];
    expect(saved.status).toBe('pending');
    expect(JSON.stringify(saved)).not.toContain('pupil-17');
    first.close();

    const reopened = openOutbox();
    expect(await reopened.send(input)).toBe('sent');
    expect(requests[1]).toEqual(requests[0]);
    expect(input.evidence).toHaveBeenCalledTimes(1);
    const page = await getInsightMailboxPage({
      ...input,
      isoDay: '2026-10-18',
      writeToken: credentials.writeToken,
    });
    expect(page.envelopes).toHaveLength(1);
    expect(
      await openInsightEnvelope(owner, page.envelopes[0].envelope, {
        shareId: input.shareId,
        isoDay: '2026-10-18',
      }),
    ).toEqual(evidence);
    expect((await inspect())[0]).toEqual({
      shareId: input.shareId,
      isoDay: '2026-10-18',
      relayUrl,
      keyId: owner.recipient.keyId,
      slotId: saved.slotId,
      status: 'sent',
    });
    reopened.close();
    expect(await openOutbox().send(input)).toBe('idle');
    expect(requests).toHaveLength(2);
  });

  it('makes concurrent tabs use one committed packet even when they seal different evidence', async () => {
    const input = options();
    let release!: () => void;
    const bothUploading = new Promise<void>((resolve) => {
      release = resolve;
    });
    input.fetchImpl.mockImplementation(async () => {
      if (input.fetchImpl.mock.calls.length === 2) release();
      await bothUploading;
      return new Response(null, { status: 204 });
    });
    const other = {
      ...input,
      evidence: async () => new TextEncoder().encode('different evidence'),
    };
    await Promise.all([openOutbox().send(input), openOutbox().send(other)]);
    const calls = input.fetchImpl.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
    expect(await inspect()).toHaveLength(1);
  });

  it('never uploads when the packet commit fails', async () => {
    const input = options();
    vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(
      new DOMException('Storage is full', 'QuotaExceededError'),
    );
    await expect(openOutbox().send(input)).rejects.toThrow('Storage is full');
    expect(input.fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves the retry packet if saving the accepted acknowledgement fails', async () => {
    const input = options();
    input.fetchImpl.mockImplementationOnce(async () => {
      vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(new Error('Commit failed'));
      return new Response(null, { status: 204 });
    });
    const outbox = openOutbox();
    await expect(outbox.send(input)).rejects.toThrow('Commit failed');
    expect((await inspect())[0].status).toBe('pending');
    expect(await outbox.send(input)).toBe('sent');
    expect(input.fetchImpl.mock.calls[0][0]).toBe(input.fetchImpl.mock.calls[1][0]);
    expect(input.fetchImpl.mock.calls[0][1]?.body).toBe(input.fetchImpl.mock.calls[1][1]?.body);
    expect(input.evidence).toHaveBeenCalledTimes(1);
  });

  it('holds a pending packet while opted out and reuses it on opting back in', async () => {
    const input = options();
    let optedIn = true;
    input.isOptedIn = () => optedIn;
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Reply lost'));
    const outbox = openOutbox();
    await expect(outbox.send(input)).rejects.toThrow();
    optedIn = false;
    expect(await outbox.send(input)).toBe('idle');
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
    optedIn = true;
    expect(await outbox.send(input)).toBe('sent');
    expect(input.fetchImpl.mock.calls[0][0]).toBe(input.fetchImpl.mock.calls[1][0]);
    expect(input.fetchImpl.mock.calls[0][1]?.body).toBe(input.fetchImpl.mock.calls[1][1]?.body);
    expect(input.evidence).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a damaged stored packet without collecting or uploading a replacement', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Offline'));
    const outbox = openOutbox();
    await expect(outbox.send(input)).rejects.toThrow();
    const database = new Dexie(databaseName);
    try {
      await database.open();
      const packet = (await database.table('packets').toArray())[0];
      packet.envelope.d = '2026-10-17';
      await database.table('packets').put(packet);
    } finally {
      database.close();
    }
    await expect(outbox.send(input)).rejects.toThrow('routing');
    expect(input.evidence).toHaveBeenCalledTimes(1);
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('respects opt-out before collection and rechecks it after collection', async () => {
    const input = options();
    let optedIn = false;
    input.isOptedIn = () => optedIn;
    const outbox = openOutbox();
    expect(await outbox.send(input)).toBe('idle');
    expect(input.evidence).not.toHaveBeenCalled();
    optedIn = true;
    input.evidence.mockImplementationOnce(async () => {
      optedIn = false;
      return evidence;
    });
    expect(await outbox.send(input)).toBe('idle');
    expect(input.fetchImpl).not.toHaveBeenCalled();
    expect((await indexedDB.databases()).map((entry) => entry.name)).not.toContain('lacuna');
  });

  it('does not upload an old pending day or collect missed days after reopening', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Offline'));
    const first = openOutbox();
    await expect(first.send(input)).rejects.toThrow();
    first.close();
    clock = Date.parse('2026-10-24T12:00:00Z');
    expect(await openOutbox().send(input)).toBe('sent');
    const packets = await inspect();
    expect(packets).toHaveLength(1);
    expect(packets[0].isoDay).toBe('2026-10-23');
    expect(input.fetchImpl.mock.calls[1][0]).toContain('/2026-10-23/');
    expect(input.fetchImpl.mock.calls[1][0]).not.toBe(input.fetchImpl.mock.calls[0][0]);
  });

  it('stops if the UTC day changes during collection or the request is already cancelled', async () => {
    const input = options();
    input.evidence.mockImplementationOnce(async () => {
      clock += 24 * 60 * 60 * 1000;
      return evidence;
    });
    const outbox = openOutbox();
    expect(await outbox.send(input)).toBe('idle');
    expect(await outbox.send({ ...input, signal: AbortSignal.abort() })).toBe('idle');
    expect(input.evidence).toHaveBeenCalledTimes(1);
    expect(input.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses silently changing the relay or teacher key of a saved packet', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Offline'));
    const outbox = openOutbox();
    await expect(outbox.send(input)).rejects.toThrow();
    await expect(outbox.send({ ...input, relayUrl: 'https://other.example' })).rejects.toThrow(
      'does not match',
    );
    await expect(
      outbox.send({
        ...input,
        recipient: { ...owner.recipient, keyId: 'b'.repeat(64) },
      }),
    ).rejects.toThrow('does not match');
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
    expect(input.evidence).toHaveBeenCalledTimes(1);
  });
});
