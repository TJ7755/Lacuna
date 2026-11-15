import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db } from './schema';
import { replacementLifecycle } from './replacementLifecycle';
import { resetTestDatabase } from './database.testFixtures';

it('drains admitted writes and clears content and device state before the next fixture', async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = replacementLifecycle.admitWrite(async () => {
    started();
    await pending;
    await db.tombstones.put({ table: 'cards', recordId: 'late-card', deletedAt: 1 });
    await db.appState.put({ key: 'syncState', value: { channelId: 'old-owner' } });
  });
  await ready;
  const reset = resetTestDatabase();
  release();
  await Promise.all([write, reset]);

  expect(await db.tombstones.count()).toBe(0);
  expect(await db.appState.get('syncState')).toBeUndefined();
  await db.appState.put({ key: 'next-fixture', value: true });
  expect((await db.appState.get('next-fixture'))?.value).toBe(true);
  await resetTestDatabase();
});
