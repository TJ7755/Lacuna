import { defineConfig } from 'vitest/config';

// Unit tests for the FSRS-6 engine, forward simulation, IndexedDB migrations,
// components, hooks and state management. Happy DOM supplies browser globals;
// tests/setup.ts supplies fake IndexedDB for persistence tests.
export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'happy-dom',
    clearMocks: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts', 'server/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
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
        statements: 92,
        branches: 85,
        functions: 99,
        lines: 92,
      },
    },
  },
});
