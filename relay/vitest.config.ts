import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
