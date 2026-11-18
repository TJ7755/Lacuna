import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it, vi } from 'vitest';
import { ensurePreMigrationSnapshot } from './schema';

it('refuses the FSRS7 upgrade when the independent recovery snapshot cannot be saved', async () => {
  const name = `lacuna-fsrs7-recovery-${Date.now()}`;
  const legacy = new Dexie(name);
  legacy.version(32).stores({ cards: 'id' });
  await legacy.open();
  await legacy.table('cards').put({ id: 'learnt', stability: 20, due: 9000 });
  legacy.close();
  const save = vi.fn().mockRejectedValue(new Error('Snapshot quota exhausted'));
  try {
    await expect(ensurePreMigrationSnapshot(name, 33, save)).rejects.toThrow(
      'Snapshot quota exhausted',
    );
    expect(save).toHaveBeenCalledWith(
      33,
      expect.objectContaining({
        cards: [expect.objectContaining({ id: 'learnt', stability: 20, due: 9000 })],
      }),
    );
    await legacy.open();
    expect(legacy.verno).toBe(32);
    expect(await legacy.table('cards').get('learnt')).toEqual({
      id: 'learnt',
      stability: 20,
      due: 9000,
    });
  } finally {
    legacy.close();
    await legacy.delete();
  }
});
