import { configDefaults, defineConfig } from 'vitest/config';

const nodeTests = [
  'src/fsrs/**/*.test.ts',
  'src/course/**/*.test.ts',
  'src/questions/generators/**/*.test.ts',
  'server/**/*.test.ts',
  'scripts/**/*.test.ts',
];

// These tests also exercise browser-backed preferences through the repository.
const browserStorageTests = [
  'src/course/localLessonOrder.test.ts',
  'src/fsrs/optimise.persistence.test.ts',
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
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
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
        'src/course/path.ts',
        'src/course/unlock.ts',
        'src/fsrs/session.ts',
        'src/db/lineageDiff.ts',
      ],
      thresholds: {
        perFile: true,
        'src/course/path.ts': { statements: 95, branches: 94, functions: 99, lines: 95 },
        'src/course/unlock.ts': { statements: 98, branches: 98, functions: 99, lines: 98 },
        'src/fsrs/session.ts': { statements: 94, branches: 81, functions: 99, lines: 95 },
        'src/db/lineageDiff.ts': { statements: 80, branches: 82, functions: 99, lines: 80 },
      },
    },
  },
});
