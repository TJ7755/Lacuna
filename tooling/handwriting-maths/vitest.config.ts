import { defineConfig } from 'vitest/config';

/** Local config so Vitest does not walk up and inherit the main application's setup
 *  file. These tests are pure and need no DOM environment. */
export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'node',
    maxWorkers: 1,
    include: ['src/**/*.test.ts'],
  },
});
