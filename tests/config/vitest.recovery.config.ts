import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Coverage for the recovery paths is intentionally separate from the existing
 * critical-domain gate. These modules have different risk profiles and a
 * combined average would hide weak portability or asset branches.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    allowOnly: !process.env.CI,
    environment: 'happy-dom',
    clearMocks: false,
    include: [
      'src/db/persistence.test.ts',
      'src/sync/manualMerge.test.ts',
      'src/sync/manualMerge.restorePoint.test.ts',
      'src/sync/manualMerge.review-convergence.test.ts',
      'src/hooks/useStorageQuotaWarning.test.ts',
      'src/db/backups.test.ts',
      'src/db/backupSnapshot.test.ts',
      'src/db/portability*.test.ts',
      'src/db/specificationPortability.test.ts',
      'src/sync/mergeSnapshots*.test.ts',
      'src/sync/specificationSnapshots.test.ts',
      'src/db/assets.test.ts',
    ],
    setupFiles: ['./tests/setup.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage/recovery',
      include: [
        'src/db/persistence.ts',
        'src/sync/manualMerge.ts',
        'src/sync/snapshotAssets.ts',
        'src/sync/snapshotReviews.ts',
        'src/sync/snapshotRecords.ts',
        'src/sync/mergeSnapshots.ts',
        'src/hooks/useStorageQuotaWarning.ts',
        'src/db/backups.ts',
        'src/db/backupSnapshot.ts',
        'src/db/portability.ts',
        'src/db/backupRecovery.ts',
        'src/db/backupReplacement.ts',
        'src/db/backupPreparation.ts',
        'src/db/assets.ts',
        'src/db/assetCodec.ts',
        'src/db/markdownAssetExtraction.ts',
      ],
      thresholds: {
        perFile: true,
        'src/db/persistence.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/sync/manualMerge.ts': { statements: 98, branches: 90, functions: 98, lines: 98 },
        'src/hooks/useStorageQuotaWarning.ts': {
          statements: 94,
          branches: 80,
          functions: 98,
          lines: 94,
        },
        'src/db/backups.ts': { statements: 75, branches: 82, functions: 67, lines: 75 },
        'src/db/portability.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/sync/snapshotAssets.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/sync/snapshotReviews.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/sync/snapshotRecords.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/sync/mergeSnapshots.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/db/backupRecovery.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/db/backupReplacement.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/db/backupPreparation.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/db/backupSnapshot.ts': { statements: 85, branches: 76, functions: 88, lines: 85 },
        'src/db/assets.ts': { statements: 68, branches: 68, functions: 82, lines: 68 },
        'src/db/assetCodec.ts': { statements: 68, branches: 68, functions: 82, lines: 68 },
        'src/db/markdownAssetExtraction.ts': {
          statements: 68,
          branches: 68,
          functions: 82,
          lines: 68,
        },
      },
    },
  },
});
