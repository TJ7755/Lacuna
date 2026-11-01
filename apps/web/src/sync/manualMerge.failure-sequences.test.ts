import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetBackupThrottleForTests, restoreBackup, takeAutoBackup } from '../db/backups';
import { exportDatabase, importBackup } from '../db/portability';
import {
  recoverySequenceContent,
  recoverySequenceExpect,
  recoverySequenceSeed,
} from '../db/recoverySequence.testFixtures';
import { db } from '../db/schema';
import { manualMerge } from './manualMerge';

beforeEach(async () => {
  await db.delete();
  await db.open();
  __resetBackupThrottleForTests();
});

describe('manual combine failure recovery sequences', () => {
  it.each(['safety backup', 'replacement'] as const)(
    'retains history and media through a failed %s, retry, export and restore',
    async (stage) => {
      const remote = await recoverySequenceSeed('Remote');
      const payload = await exportDatabase();
      await db.delete();
      await db.open();
      const local = await recoverySequenceSeed('Local');
      await takeAutoBackup(true);
      const [original] = await db.backups.toArray();
      const before = recoverySequenceContent(await exportDatabase());
      const failure = new Error(`Interrupted ${stage}`);
      let failures = 0;
      const interruptBackup = () => {
        failures += 1;
        throw failure;
      };
      const interruptReplacement = (_key: unknown, unit: { id: string }) => {
        if (unit.id === remote.card.schedulingUnitId) {
          failures += 1;
          throw failure;
        }
      };
      if (stage === 'safety backup') db.backups.hook('creating', interruptBackup);
      else db.schedulingUnits.hook('creating', interruptReplacement);
      try {
        await expect(manualMerge(payload)).rejects.toMatchObject({
          name: 'ManualMergeError',
          message: expect.stringContaining(failure.message),
          // The existing flag conservatively reports an attempted replacement.
          databaseModified: stage === 'replacement',
        });
      } finally {
        db.backups.hook('creating').unsubscribe(interruptBackup);
        db.schedulingUnits.hook('creating').unsubscribe(interruptReplacement);
      }
      expect(failures).toBe(1);
      db.close();
      await db.open();
      expect(recoverySequenceContent(await exportDatabase())).toEqual(before);
      await recoverySequenceExpect(local);
      expect(await db.backups.get(original.id!)).toEqual(original);
      const afterFailure = await db.backups.toArray();
      // A committed safety snapshot is allowed even when replacement rolls back.
      expect(afterFailure).toHaveLength(stage === 'replacement' ? 2 : 1);
      for (const snapshot of afterFailure) {
        expect(recoverySequenceContent(snapshot.payload)).toEqual(before);
      }

      const summary = await manualMerge(payload);
      expect(summary.cards).toEqual({ kept: 1, added: 1, removed: 0 });
      expect(summary.reviewEvents).toEqual({ kept: 1, added: 1, removed: 0 });
      await recoverySequenceExpect(local, remote);
      const exported = JSON.parse(JSON.stringify(await exportDatabase()));
      await importBackup(exported, 'replace');
      await recoverySequenceExpect(local, remote);
      // Restore the snapshot retained by the failed attempt, then retry the combine again.
      await restoreBackup(afterFailure.at(-1)!.id!);
      await recoverySequenceExpect(local);
      await manualMerge(payload);
      await recoverySequenceExpect(local, remote);
    },
  );
});
