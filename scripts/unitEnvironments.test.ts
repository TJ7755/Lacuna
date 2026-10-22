import { expect, it } from 'vitest';

it('runs command-line tests without browser globals', () => {
  expect('document' in globalThis).toBe(false);
  expect('window' in globalThis).toBe(false);
});
