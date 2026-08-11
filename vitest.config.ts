import { defineConfig } from 'vitest/config';

// Unit tests for the FSRS-6 engine, forward-simulation layer and IndexedDB
// migration, plus UI components, hooks, and state management. The forward-sim
// module is pure, so the default Node environment is sufficient for database
// tests; component tests rely on happy-dom for browser globals.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    // One worker keeps the suite inside the memory budget of supported developer
    // machines and makes timing-sensitive component tests deterministic.
    minWorkers: 1,
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
        statements: 92,
        branches: 85,
        functions: 99,
        lines: 92,
      },
    },
  },
});
