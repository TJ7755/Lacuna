import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { usageBatchSchema } from '@lacuna/protocol/usage';
import { createUsageOutbox, usageDay } from './outbox';

const name = 'lacuna.usage.outbox-test';
const dayMs = 86_400_000;
let clock = Date.parse('2026-11-08T12:00:00Z');
const open = () => createUsageOutbox(name, () => clock);
const allowed = () => true;

afterEach(async () => {
  await Dexie.delete(name);
});

function viewDelta(page = 'course') {
  return new Map([
    [usageDay(clock), { rows: new Map([[`view/${page}`, 1]]), used: new Set([page]) }],
  ]);
}

it('claims one daily browser contribution across tabs and preserves the retry receipt', async () => {
  const a = open();
  const b = open();
  try {
    await Promise.all([a.persist(viewDelta(), allowed), b.persist(viewDelta(), allowed)]);
    const first = usageBatchSchema.parse(await a.next());
    expect(await b.next()).toEqual(first);
    await a.acknowledge(first.id);
    const second = usageBatchSchema.parse(await b.next());
    expect(second.id).not.toBe(first.id);
    expect([...first.rows, ...second.rows]).toEqual(
      expect.arrayContaining([
        ['view/course', 1, 1],
        ['view/course', 1, 0],
      ]),
    );
    await b.discard();
    expect(await a.next()).toBeUndefined();
  } finally {
    a.close();
    b.close();
  }
});

it('calculates repeat use locally once per window and prunes stale uploads', async () => {
  const outbox = open();
  try {
    await outbox.persist(viewDelta(), allowed);
    await outbox.persist(viewDelta('lesson'), allowed);
    clock += 2 * dayMs;
    await outbox.persist(viewDelta(), allowed);
    const returnBatch = usageBatchSchema.parse(await outbox.next());
    expect(returnBatch.day).toBe(usageDay(clock));
    expect(returnBatch.rows).toEqual([
      ['view/course', 1, 1],
      ['return/course/week', 1, 1],
    ]);
    await outbox.acknowledge(returnBatch.id);
    clock += dayMs;
    await outbox.persist(viewDelta(), allowed);
    expect(usageBatchSchema.parse(await outbox.next()).rows).toEqual([['view/course', 1, 1]]);
    clock += 6 * dayMs;
    await outbox.persist(viewDelta('lesson'), allowed);
    expect(usageBatchSchema.parse(await outbox.next()).rows).toEqual([
      ['view/lesson', 1, 1],
      ['return/lesson/month', 1, 1],
    ]);
  } finally {
    outbox.close();
  }
});
