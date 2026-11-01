import { describe, expect, it } from 'vitest';
import type { BackupFile, Grade } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import { mergeSnapshots, type MergedBackupFile } from './mergeSnapshots';
import {
  backup,
  card,
  course,
  historyEntry,
  memory,
  review,
  sample,
  tombstone,
} from './mergeSnapshots.testFixtures';

// Fixed seeds and bounded traces keep failures reproducible without a property-test dependency.
const SEEDS = [1, 7, 42, 101, 256, 1024, 65537, 0x12345678, 0x622dc87f, 0xdeadbeef];
const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function randomIndex(seed: number): (limit: number) => number {
  let state = seed >>> 0;
  return (limit) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
}

describe('bounded peer operation sequences', () => {
  it.each(SEEDS)('preserves content, receipts and retained deletions for seed %i', (seed) => {
    const pick = randomIndex(seed);
    const peers: BackupFile[] = Array.from({ length: 3 }, () =>
      backup({
        courses: [course('course-1')],
        cards: [card('c0'), card('c1'), card('deleted')],
        reviewHistory: [],
        tombstones: [],
      }),
    );
    const stale: BackupFile[] = [structuredClone(peers[0])];
    const authored = new Map([
      ['c0', 'Q'],
      ['c1', 'Q'],
    ]);
    const receipts: ReviewHistoryEntry[] = [];
    const trace: string[] = [];
    let clock = 1_800_000_000_000;
    let latestTieAt = 0;

    function deliver(to: number, from: BackupFile): MergedBackupFile {
      const merged = mergeSnapshots(peers[to], from);
      const context = `seed ${seed}: ${trace.join('; ')}`;
      expect(mergeSnapshots(merged, merged), context).toEqual(merged);
      expect(mergeSnapshots(merged, from), context).toEqual(merged);
      peers[to] = merged;
      return merged;
    }

    // Each block exercises every operation, with seed-dependent order, peers and payloads.
    for (let block = 0; block < 6; block++) {
      const operations = ['edit', 'review', 'tie', 'deliver'];
      while (operations.length) {
        const operation = operations.splice(pick(operations.length), 1)[0];
        const peer = pick(3);
        const other = (peer + 1 + pick(2)) % 3;
        const id = `c${pick(2)}`;
        const at = clock++;
        trace.push(`${operation}@${at}:p${peer}/p${other}/${id}`);
        const snapshot = peers[peer];

        if (operation === 'edit') {
          const front = `seed ${seed}, edit ${block}, peer ${peer}`;
          peers[peer] = {
            ...snapshot,
            cards: snapshot.cards.map((row) =>
              row.id === id ? { ...row, front, updatedAt: at } : row,
            ),
          };
          authored.set(id, front);
        } else if (operation === 'review') {
          const eventId = `seed-${seed}/review-${block}`;
          const log = review({ eventId, timestamp: at, grade: (1 + pick(4)) as Grade });
          const receipt = historyEntry(id, log);
          receipts.push(receipt);
          peers[peer] = {
            ...snapshot,
            reviewHistory: [...(snapshot.reviewHistory ?? []), receipt],
            sessionHistory: [...snapshot.sessionHistory, sample(eventId, at)],
            // Older backups can carry the same receipt in a card projection as well.
            cards: snapshot.cards.map((row) =>
              row.id === id ? { ...row, history: [...row.history, log] } : row,
            ),
          };
        } else if (operation === 'tie') {
          // Only content differs: the documented canonical JSON tie winner is unambiguous.
          peers[peer] = {
            ...snapshot,
            agentMemories: [memory('preference', { content: 'alpha', updatedAt: at })],
          };
          peers[other] = {
            ...peers[other],
            agentMemories: [memory('preference', { content: 'zeta', updatedAt: at })],
          };
          latestTieAt = at;
        } else {
          deliver(peer, peers[other]);
        }
        stale.push(structuredClone(peers[peer]));
      }
    }

    // An equal-time edit must lose to deletion. No later edit or tombstone pruning occurs.
    const deletedLog = review({ eventId: `seed-${seed}/deleted`, timestamp: clock, grade: 3 });
    const deletedAt = clock + 1;
    peers[0] = {
      ...peers[0],
      cards: peers[0].cards.map((row) =>
        row.id === 'deleted' ? { ...row, updatedAt: deletedAt, history: [deletedLog] } : row,
      ),
      reviewHistory: [...(peers[0].reviewHistory ?? []), historyEntry('deleted', deletedLog)],
      sessionHistory: [...peers[0].sessionHistory, sample(deletedLog.eventId!, clock)],
    };
    stale.push(structuredClone(peers[0]));
    peers[1] = { ...peers[1], tombstones: [tombstone('cards', 'deleted', clock)] };
    peers[2] = { ...peers[2], tombstones: [tombstone('cards', 'deleted', deletedAt)] };

    const context = `seed ${seed}: ${trace.join('; ')}`;
    const expectedReceipts = [...receipts].sort((a, b) => a.id.localeCompare(b.id));
    const results = ORDERS.map(([first, second, third]) =>
      mergeSnapshots(mergeSnapshots(peers[first], peers[second]), peers[third]),
    );
    // These histories contain consistent event identities. This is not a claim that arbitrary
    // conflicting receipts, pruned tombstones or every collection form a commutative merge.
    for (const result of results) {
      expect(result, context).toEqual(results[0]);
      expect(
        result.cards.map((row) => row.id),
        context,
      ).toEqual(['c0', 'c1']);
      for (const row of result.cards) {
        expect(row.front, context).toBe(authored.get(row.id));
        expect(row.history, context).toEqual([]);
        const events = receipts.filter((entry) => entry.cardId === row.id);
        expect(row.reps, context).toBe(events.length);
        expect(row.lastReviewed, context).toBe(
          events.length ? Math.max(...events.map((entry) => entry.timestamp)) : null,
        );
      }
      expect(result.agentMemories, context).toEqual([
        memory('preference', { content: 'zeta', updatedAt: latestTieAt }),
      ]);
      expect(result.reviewHistory, context).toEqual(expectedReceipts);
      expect(new Set(result.reviewHistory.map((entry) => entry.eventId)).size, context).toBe(
        receipts.length,
      );
      expect(result.sessionHistory.map((entry) => entry.eventId).sort(), context).toEqual(
        receipts.map((entry) => entry.eventId).sort(),
      );
      expect(result.tombstones, context).toEqual([tombstone('cards', 'deleted', deletedAt)]);
      expect(mergeSnapshots(result, result), context).toEqual(result);
    }

    // Deliver every archived snapshot in seed-dependent order, including a receipt-bearing
    // equal-time edit of the deleted card. Repeated stale delivery must not resurrect it.
    peers.fill(results[0]);
    while (stale.length) {
      const archived = stale.splice(pick(stale.length), 1)[0];
      const peer = pick(3);
      trace.push(`stale:p${peer}, remaining=${stale.length}`);
      expect(deliver(peer, archived), context).toEqual(results[0]);
    }
  });
});
