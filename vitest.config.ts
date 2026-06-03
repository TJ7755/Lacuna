import { defineConfig } from 'vitest/config';

// Unit tests for the FSRS-6 engine, forward-simulation layer and IndexedDB
// migration. The forward-sim module is pure, so the default Node environment is
// sufficient; database tests pull in `fake-indexeddb/auto` themselves.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
