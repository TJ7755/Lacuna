import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { capturePreMigrationSnapshot, ensurePreMigrationSnapshot } from './schema';
import { schemaV27 } from './migrationFixtures';

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await new Dexie(name).delete();
});

async function createProfile(version = 27) {
  const name = `lacuna-snapshot-${crypto.randomUUID()}`;
  names.push(name);
  const profile = new Dexie(name);
  profile.version(version).stores(schemaV27);
  await profile.open();
  await profile.table('appState').put({ key: 'protected', value: 'learner data' });
  await profile.table('courses').put({ id: 'course-1', name: 'Protected course', createdAt: 1 });
  profile.close();
  return name;
}

it('captures supported v27 data without changing the source database', async () => {
  const name = await createProfile();
  const save = vi.fn();
  await capturePreMigrationSnapshot(name, 31, save);
  expect(save).toHaveBeenCalledWith(
    31,
    expect.objectContaining({
      courses: [expect.objectContaining({ id: 'course-1', name: 'Protected course' })],
    }),
  );
  const source = new Dexie(name);
  await source.open();
  expect(source.verno).toBe(27);
  expect(await source.table('appState').get('protected')).toEqual({
    key: 'protected',
    value: 'learner data',
  });
  source.close();
});

it('detects supported databases without indexedDB.databases', async () => {
  const name = await createProfile();
  const original = indexedDB.databases;
  Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true });
  const save = vi.fn();
  try {
    await capturePreMigrationSnapshot(name, 31, save);
    expect(save).toHaveBeenCalledOnce();
  } finally {
    Object.defineProperty(indexedDB, 'databases', { value: original, configurable: true });
  }
});

it('skips the snapshot when already at the target version', async () => {
  const name = await createProfile(31);
  const save = vi.fn();
  await ensurePreMigrationSnapshot(name, 31, save);
  expect(save).not.toHaveBeenCalled();
});

it('refuses a below-floor database before writing a snapshot or changing its rows', async () => {
  const name = await createProfile(26);
  const save = vi.fn();
  await expect(ensurePreMigrationSnapshot(name, 31, save)).rejects.toThrow(/27/);
  expect(save).not.toHaveBeenCalled();
  const source = new Dexie(name);
  await source.open();
  expect(source.verno).toBe(26);
  expect(await source.table('appState').get('protected')).toEqual({
    key: 'protected',
    value: 'learner data',
  });
  source.close();
});

it('blocks the v31 rewrite if its snapshot cannot be committed', async () => {
  const name = await createProfile();
  const failure = new Error('Snapshot storage unavailable');
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await expect(
      ensurePreMigrationSnapshot(name, 31, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  } finally {
    log.mockRestore();
  }
});
