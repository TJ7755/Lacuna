import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    allowOnly: !process.env.CI,
    environment: 'happy-dom',
    clearMocks: false,
    include: [
      'src/db/migrations.test.ts',
      'src/db/schemaV*.test.ts',
      'src/db/courseRepository.test.ts',
      'src/db/arc4Persistence.test.ts',
      'src/db/repository.mutation.test.ts',
      'src/db/repository.test.ts',
      'src/pages/LearnMode.test.tsx',
      'src/pages/learn/useLearnSession.test.tsx',
      'src/pages/learn/simpleSessionPersistence.test.ts',
      'src/pages/learn/sessionScope.test.ts',
    ],
    setupFiles: ['./tests/setup.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/risk',
      include: [
        'src/db/schema.ts',
        'src/db/preMigrationSnapshots.ts',
        'src/db/cardRepository.ts',
        'src/db/lessonRepository.ts',
        'src/db/noteRepository.ts',
        'src/pages/learn/useLearnSession.ts',
        'src/pages/learn/simpleSessionPersistence.ts',
      ],
      thresholds: {
        perFile: true,
        'src/db/schema.ts': { statements: 72, branches: 60, functions: 66, lines: 75 },
        'src/db/preMigrationSnapshots.ts': { statements: 82, functions: 70, lines: 82 },
        'src/db/cardRepository.ts': { statements: 82, branches: 70, functions: 87, lines: 84 },
        'src/db/lessonRepository.ts': { statements: 87, branches: 77, functions: 81, lines: 89 },
        'src/db/noteRepository.ts': { statements: 67, branches: 72, functions: 51, lines: 65 },
        'src/pages/learn/useLearnSession.ts': {
          statements: 83,
          branches: 68,
          functions: 81,
          lines: 88,
        },
        'src/pages/learn/simpleSessionPersistence.ts': {
          statements: 96,
          branches: 91,
          functions: 98,
          lines: 98,
        },
      },
    },
  },
});
