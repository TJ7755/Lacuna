import { configDefaults, defineConfig } from 'vitest/config';

const nodeTests = [
  'apps/web/src/fsrs/**/*.test.ts',
  'apps/web/src/course/**/*.test.ts',
  'apps/web/src/questions/generators/**/*.test.ts',
  'apps/ai/server/**/*.test.ts',
  'scripts/**/*.test.ts',
];

// These tests also exercise browser-backed preferences through the repository.
const browserStorageTests = [
  'apps/web/src/course/localLessonOrder.test.ts',
  'apps/web/src/fsrs/optimise.persistence.test.ts',
];
export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'happy-dom',
    clearMocks: false,
    pool: 'forks',
    isolate: true,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTests,
          exclude: [...configDefaults.exclude, ...browserStorageTests],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['apps/web/src/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
          exclude: [...configDefaults.exclude, ...nodeTests],
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        test: {
          name: 'browser-storage',
          include: browserStorageTests,
          setupFiles: ['./tests/setup.ts'],
        },
      },
    ],
    // One worker keeps the suite inside the memory budget of supported developer
    // machines and makes timing-sensitive component tests deterministic.
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'apps/web/src/course/path.ts',
        'apps/web/src/course/pathConstruction.ts',
        'apps/web/src/course/pathGates.ts',
        'apps/web/src/course/pathPlacement.ts',
        'apps/web/src/course/pathProgress.ts',
        'apps/web/src/course/pathRules.ts',
        'apps/web/src/course/pathTypes.ts',
        'apps/web/src/course/unlock.ts',
        'apps/web/src/fsrs/session.ts',
        'apps/web/src/db/lineageDiff.ts',
      ],
      thresholds: {
        perFile: true,
        'apps/web/src/course/path.ts': { statements: 95, branches: 94, functions: 99, lines: 95 },
        'apps/web/src/course/pathConstruction.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/pathGates.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/pathPlacement.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/pathProgress.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/pathRules.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/pathTypes.ts': {
          statements: 95,
          branches: 94,
          functions: 99,
          lines: 95,
        },
        'apps/web/src/course/unlock.ts': { statements: 98, branches: 98, functions: 99, lines: 98 },
        'apps/web/src/fsrs/session.ts': { statements: 94, branches: 81, functions: 99, lines: 95 },
        'apps/web/src/db/lineageDiff.ts': {
          statements: 80,
          branches: 82,
          functions: 99,
          lines: 80,
        },
      },
    },
  },
});
