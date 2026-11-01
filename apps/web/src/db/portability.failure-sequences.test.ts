import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetBackupThrottleForTests, restoreBackup, takeAutoBackup } from './backups';
import { exportDatabase, importBackup } from './portability';
import {
  recoverySequenceContent,
  recoverySequenceExpect,
  recoverySequenceSeed,
} from './recoverySequence.testFixtures';
import { db } from './schema';

beforeEach(async () => {
  await db.delete();
  await db.open();
  __resetBackupThrottleForTests();
});

describe('interrupted backup import recovery sequences', () => {
  it.each(['replace', 'merge'] as const)(
    'can retry %s after a late write failure, export the result and restore the original',
    async (mode) => {
      const incoming = await recoverySequenceSeed('Incoming');
      const payload = await exportDatabase();
      await db.delete();
      await db.open();
      const local = await recoverySequenceSeed('Local');
      await takeAutoBackup(true);
      const [restorePoint] = await db.backups.toArray();
      const before = recoverySequenceContent(await exportDatabase());
      let failures = 0;
      const interrupt = (_key: unknown, unit: { id: string }) => {
        if (unit.id === incoming.card.schedulingUnitId) {
          failures += 1;
          throw new Error('Interrupted incoming scheduling-unit write');
        }
      };
      // This write follows card, asset, note and review-history application in both modes.
      db.schedulingUnits.hook('creating', interrupt);
      try {
        await expect(importBackup(payload, mode)).rejects.toThrow(
          'Interrupted incoming scheduling-unit write',
        );
      } finally {
        db.schedulingUnits.hook('creating').unsubscribe(interrupt);
      }
      expect(failures).toBe(1);
      db.close();
      await db.open();
      expect(recoverySequenceContent(await exportDatabase())).toEqual(before);
      await recoverySequenceExpect(local);
      expect(await db.backups.get(restorePoint.id!)).toEqual(restorePoint);

      await importBackup(payload, mode);
      const expected = mode === 'merge' ? [local, incoming] : [incoming];
      await recoverySequenceExpect(...expected);
      // Round-trip the user-exported JSON through replacement as well as the stored snapshot.
      const exported = JSON.parse(JSON.stringify(await exportDatabase()));
      await importBackup(exported, 'replace');
      await recoverySequenceExpect(...expected);
      await restoreBackup(restorePoint.id!);
      await recoverySequenceExpect(local);
      expect(await db.backups.get(restorePoint.id!)).toEqual(restorePoint);
    },
  );
});
