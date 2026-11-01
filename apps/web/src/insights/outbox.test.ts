import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../relay/src/relay';
import { MemoryStore } from '../../../relay/src/store';
import { createInsightsOwner, openInsightEnvelope, type InsightsOwner } from './envelope';
import { getInsightMailboxPage } from './mailbox';
import {
  insightDayExpiresAt,
  INSIGHT_RETENTION_DAYS,
  DAY_MS,
} from '../../../relay/shared/insights/index';
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

async function inspectSnapshots() {
  const database = new Dexie(databaseName);
  try {
    await database.open();
    return await database.table('snapshots').toArray();
  } finally {
    database.close();
  }
}

describe('current-progress snapshots', () => {
  it('publishes today, skips unchanged evidence and revises one stable slot after more work', async () => {
    const input = options();
    const outbox = openOutbox();
    expect(await outbox.publish(input)).toBe('sent');
    expect(await outbox.publish(input)).toBe('unchanged');
    input.evidence.mockResolvedValue(new TextEncoder().encode('more completed work'));
    expect(await outbox.publish(input)).toBe('sent');
    const calls = input.fetchImpl.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][0]).toContain('/2026-10-19/');
    const first = new Headers(calls[0][1]?.headers);
    const second = new Headers(calls[1][1]?.headers);
    expect(first.get('Authorization')).toMatch(/^Bearer [0-9a-f]{64}$/);
    expect(second.get('Authorization')).toBe(first.get('Authorization'));
    expect(first.get('X-Insights-Revision')).toBe('1');
    expect(second.get('X-Insights-Revision')).toBe('2');
    expect(await inspect()).toEqual([]);
    expect(await inspectSnapshots()).toMatchObject([{ status: 'sent', revision: 2 }]);
  });

  it('retries exact committed bytes after a lost acknowledgement, then publishes newer evidence', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Reply lost after acceptance'));
    const first = openOutbox();
    await expect(first.publish(input)).rejects.toThrow('Could not reach');
    const pending = (await inspectSnapshots())[0];
    expect(pending).toMatchObject({ status: 'pending', revision: 1 });
    expect(JSON.stringify(pending)).not.toContain('pupil-17');
    first.close();
    input.evidence.mockResolvedValue(new TextEncoder().encode('new work after failure'));
    expect(await openOutbox().publish(input)).toBe('sent');
    const calls = input.fetchImpl.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(calls[1][1]?.body).toBe(calls[0][1]?.body);
    expect(calls[1][1]?.headers).toEqual(calls[0][1]?.headers);
    expect(new Headers(calls[2][1]?.headers).get('X-Insights-Revision')).toBe('2');
  });

  it('never fetches before the snapshot commit succeeds', async () => {
    const input = options();
    vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(new Error('Storage full'));
    await expect(openOutbox().publish(input)).rejects.toThrow('Storage full');
    expect(input.fetchImpl).not.toHaveBeenCalled();
  });

  it('retains pending bytes if the acknowledgement commit fails', async () => {
    const input = options();
    input.fetchImpl.mockImplementationOnce(async () => {
      vi.spyOn(Dexie.prototype, 'transaction').mockRejectedValueOnce(new Error('Commit failed'));
      return new Response(null, { status: 204 });
    });
    const outbox = openOutbox();
    await expect(outbox.publish(input)).rejects.toThrow('Commit failed');
    expect(await inspectSnapshots()).toMatchObject([{ status: 'pending', revision: 1 }]);
    expect(await outbox.publish(input)).toBe('sent');
    expect(input.fetchImpl.mock.calls[1][1]?.body).toBe(input.fetchImpl.mock.calls[0][1]?.body);
  });

  it.each([false, true])(
    'does not let a delayed acknowledgement overwrite another tab’s newer revision (lost reply: %s)',
    async (loseReply) => {
      const input = options();
      let started!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      input.fetchImpl.mockImplementationOnce(async () => {
        started();
        await delayed;
        if (loseReply) throw new TypeError('Acknowledgement lost');
        return new Response(null, { status: 204 });
      });
      const first = openOutbox().publish(input);
      await ready;
      input.evidence.mockResolvedValue(new TextEncoder().encode('new work'));
      expect(await openOutbox().publish(input)).toBe('sent');
      const latest = (await inspectSnapshots())[0];
      expect(latest).toMatchObject({ status: 'sent', revision: 2 });
      release();
      expect(await first).toBe('unchanged');
      expect((await inspectSnapshots())[0]).toEqual(latest);
      const calls = input.fetchImpl.mock.calls;
      expect(new Set(calls.map(([url]) => url)).size).toBe(1);
      expect(calls[1][1]?.body).toBe(calls[0][1]?.body);
    },
  );

  it('holds ambiguous pending bytes through opt-out and does not mark a late response sent', async () => {
    const input = options();
    let optedIn = true;
    input.isOptedIn = () => optedIn;
    input.fetchImpl.mockImplementationOnce(async () => {
      optedIn = false;
      return new Response(null, { status: 204 });
    });
    const outbox = openOutbox();
    expect(await outbox.publish(input)).toBe('idle');
    expect(await inspectSnapshots()).toMatchObject([{ status: 'pending' }]);
    expect(await outbox.publish(input)).toBe('idle');
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
    optedIn = true;
    expect(await outbox.publish(input)).toBe('sent');
    expect(input.fetchImpl.mock.calls[1][1]?.body).toBe(input.fetchImpl.mock.calls[0][1]?.body);
  });

  it('stops across midnight and finalises an existing snapshot in the same slot the next day', async () => {
    const input = options();
    const outbox = openOutbox();
    expect(await outbox.publish(input)).toBe('sent');
    clock += 86_400_000;
    input.evidence.mockResolvedValue(new TextEncoder().encode('final completed-day work'));
    expect(await outbox.send(input)).toBe('sent');
    expect(input.fetchImpl.mock.calls[1][0]).toBe(input.fetchImpl.mock.calls[0][0]);
    expect(await inspect()).toEqual([]);
    expect(await inspectSnapshots()).toMatchObject([{ isoDay: '2026-10-19', revision: 2 }]);
    input.evidence.mockImplementationOnce(async () => {
      clock += 86_400_000;
      return evidence;
    });
    expect(await outbox.publish(input)).toBe('idle');
    expect(input.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps legacy pending retries exact and never creates a snapshot beside an accepted legacy day', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Reply lost'));
    const outbox = openOutbox();
    await expect(outbox.send(input)).rejects.toThrow();
    expect(await outbox.publish(input, true)).toBe('sent');
    expect(input.fetchImpl.mock.calls[1][1]?.body).toBe(input.fetchImpl.mock.calls[0][1]?.body);
    expect(await outbox.publish(input, true)).toBe('unchanged');
    expect(await inspectSnapshots()).toEqual([]);
  });

  it('fails closed on damaged pending snapshot credentials without resealing', async () => {
    const input = options();
    input.fetchImpl.mockRejectedValueOnce(new TypeError('Offline'));
    const outbox = openOutbox();
    await expect(outbox.publish(input)).rejects.toThrow();
    const database = new Dexie(databaseName);
    await database.open();
    await database.table('snapshots').update([shareId, '2026-10-19'], { revision: 0 });
    database.close();
    await expect(outbox.publish(input)).rejects.toThrow('does not match');
    expect(input.evidence).toHaveBeenCalledTimes(1);
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

it.each([false, true])(
  'reconciles newer pending evidence after an older ACK (retry fails: %s)',
  async (retryFails) => {
    const input = options();
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    input.fetchImpl.mockImplementationOnce(async () => {
      started();
      await delayed;
      return new Response(null, { status: 204 });
    });
    const first = openOutbox().publish(input);
    const outcome = first.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    await ready;
    input.evidence.mockResolvedValue(new TextEncoder().encode('newer unaccepted work'));
    input.fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    input.fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 503 }));
    await expect(openOutbox().publish(input)).rejects.toMatchObject({ status: 503 });
    expect(await inspectSnapshots()).toMatchObject([{ status: 'pending', revision: 2 }]);
    if (retryFails)
      input.fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 503 }));
    release();
    const finished = await outcome;
    expect(input.fetchImpl.mock.calls[3][1]?.body).toBe(input.fetchImpl.mock.calls[2][1]?.body);
    if (retryFails) {
      expect(finished).toMatchObject({ error: { status: 503 } });
      expect(await inspectSnapshots()).toMatchObject([{ status: 'pending', revision: 2 }]);
    } else {
      expect(finished).toEqual({ result: 'sent' });
      expect(await inspectSnapshots()).toMatchObject([{ status: 'sent', revision: 2 }]);
    }
  },
);

it('prunes expired snapshots across shares at the exact boundary, preserving eligible pending bytes', async () => {
  const outbox = openOutbox();
  const failing = (id: string) => ({
    ...options(),
    shareId: id.repeat(32),
    fetchImpl: vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })),
  });
  await expect(outbox.publish(failing('b'))).rejects.toThrow(); // 19 October snapshot
  clock += DAY_MS;
  await expect(outbox.publish(failing('c'))).rejects.toThrow(); // 20 October snapshot
  const pendingSnapshots = await inspectSnapshots();
  const active = { ...options(), shareId: 'f'.repeat(32) };
  clock = insightDayExpiresAt('2026-10-19') - 1;
  await outbox.publish(active);
  expect((await inspectSnapshots()).filter((row) => row.shareId !== active.shareId)).toEqual(
    pendingSnapshots,
  );
  expect(await inspect()).toEqual([]);
  clock += 1;
  await outbox.publish(active);
  expect((await inspectSnapshots()).filter((row) => row.shareId !== active.shareId)).toEqual(
    pendingSnapshots.filter((row) => row.isoDay === '2026-10-20'),
  );
  expect(await inspect()).toEqual([]);
});

it('bounds snapshot retention across 86 days of publication and finalisation', async () => {
  const outbox = openOutbox();
  const input = options();
  for (let day = 0; day < INSIGHT_RETENTION_DAYS + 2; day += 1) {
    expect(await outbox.publish(input)).toBe('sent');
    clock += DAY_MS;
    expect(await outbox.send(input)).toBe('unchanged');
  }
  const snapshots = await inspectSnapshots();
  expect(snapshots).toHaveLength(INSIGHT_RETENTION_DAYS);
  expect(await inspect()).toEqual([]);
  expect(snapshots.every((row) => insightDayExpiresAt(row.isoDay) > clock)).toBe(true);
});
