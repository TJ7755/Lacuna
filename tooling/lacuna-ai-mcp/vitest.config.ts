import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    environment: 'node',
    clearMocks: false,
    include: ['src/**/*.test.ts'],
    mockReset: true,
    restoreMocks: true,
  },
});
