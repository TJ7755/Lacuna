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
      'apps/web/src/sync/manualMerge.failure-sequences.test.ts',
      'apps/web/src/db/persistence.test.ts',
      'apps/web/src/sync/manualMerge.test.ts',
      'apps/web/src/sync/manualMerge.restorePoint.test.ts',
      'apps/web/src/sync/manualMerge.review-convergence.test.ts',
      'apps/web/src/hooks/useStorageQuotaWarning.test.ts',
      'apps/web/src/db/backups.test.ts',
      'apps/web/src/db/backupSnapshot.test.ts',
      'apps/web/src/db/portability*.test.ts',
      'apps/web/src/db/specificationPortability.test.ts',
      'apps/web/src/sync/mergeSnapshots*.test.ts',
      'apps/web/src/sync/specificationSnapshots.test.ts',
      'apps/web/src/db/assets.test.ts',
    ],
    setupFiles: ['./tests/setup.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage/recovery',
      include: [
        'apps/web/src/db/persistence.ts',
        'apps/web/src/sync/manualMerge.ts',
        'apps/web/src/sync/snapshotAssets.ts',
        'apps/web/src/sync/snapshotReviews.ts',
        'apps/web/src/sync/snapshotRecords.ts',
        'apps/web/src/sync/mergeSnapshots.ts',
        'apps/web/src/hooks/useStorageQuotaWarning.ts',
        'apps/web/src/db/backups.ts',
        'apps/web/src/db/backupSnapshot.ts',
        'apps/web/src/db/portability.ts',
        'apps/web/src/db/backupRecovery.ts',
        'apps/web/src/db/backupReplacement.ts',
        'apps/web/src/db/backupPreparation.ts',
        'apps/web/src/db/assets.ts',
        'apps/web/src/db/assetCodec.ts',
        'apps/web/src/db/markdownAssetExtraction.ts',
      ],
      thresholds: {
        perFile: true,
        'apps/web/src/db/persistence.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'apps/web/src/sync/manualMerge.ts': {
          statements: 98,
          branches: 90,
          functions: 98,
          lines: 98,
        },
        'apps/web/src/hooks/useStorageQuotaWarning.ts': {
          statements: 94,
          branches: 80,
          functions: 98,
          lines: 94,
        },
        'apps/web/src/db/backups.ts': { statements: 75, branches: 82, functions: 67, lines: 75 },
        'apps/web/src/db/portability.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/sync/snapshotAssets.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/sync/snapshotReviews.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/sync/snapshotRecords.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/sync/mergeSnapshots.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/db/backupRecovery.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/db/backupReplacement.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/db/backupPreparation.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/db/backupSnapshot.ts': {
          statements: 85,
          branches: 76,
          functions: 88,
          lines: 85,
        },
        'apps/web/src/db/assets.ts': { statements: 68, branches: 68, functions: 82, lines: 68 },
        'apps/web/src/db/assetCodec.ts': { statements: 68, branches: 68, functions: 82, lines: 68 },
        'apps/web/src/db/markdownAssetExtraction.ts': {
          statements: 68,
          branches: 68,
          functions: 82,
          lines: 68,
        },
      },
    },
  },
});
