import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const electronAiConfig = readFileSync(
  resolve(root, 'tests/config/playwright.electron-ai.config.ts'),
  'utf8',
);
const electronPerformanceConfig = readFileSync(
  resolve(root, 'tests/config/playwright.electron-performance.config.ts'),
  'utf8',
);
const packagedInteractionPattern = /['"]packaged-interactions\.spec\.ts['"]/;
const aiIgnores = /testIgnore:\s*\[([^\]]*)\]/.exec(electronAiConfig)?.[1] ?? '';

describe('Electron Playwright suite boundaries', () => {
  it('keeps packaged interaction tests out of the unpackaged AI suite', () => {
    expect(aiIgnores).toMatch(packagedInteractionPattern);
    expect(electronPerformanceConfig).toMatch(
      new RegExp(`testMatch:\\s*${packagedInteractionPattern.source}`),
    );
  });

  it('keeps the packaged macOS smoke gate out of the unpackaged AI suite', () => {
    expect(aiIgnores).toMatch(/['"]macos-smoke\.spec\.ts['"]/);
  });
});
