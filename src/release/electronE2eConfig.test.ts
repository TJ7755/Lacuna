import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const electronAiConfig = readFileSync(resolve(root, 'playwright.electron-ai.config.ts'), 'utf8');
const electronPerformanceConfig = readFileSync(
  resolve(root, 'playwright.electron-performance.config.ts'),
  'utf8',
);
const packagedInteractionPattern = /['"]packaged-interactions\.spec\.ts['"]/;

describe('Electron Playwright suite boundaries', () => {
  it('keeps packaged interaction tests out of the unpackaged AI suite', () => {
    expect(electronAiConfig).toMatch(
      new RegExp(`testIgnore:\\s*${packagedInteractionPattern.source}`),
    );
    expect(electronPerformanceConfig).toMatch(
      new RegExp(`testMatch:\\s*${packagedInteractionPattern.source}`),
    );
  });
});
