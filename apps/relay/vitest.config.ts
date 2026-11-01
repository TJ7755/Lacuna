import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'node',
    maxWorkers: 1,
    include: ['tests/**/*.test.ts'],
  },
});
