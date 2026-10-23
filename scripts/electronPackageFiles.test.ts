import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileMatcher } from 'app-builder-lib/out/fileMatcher.js';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { coursePaths } from '../src/pages/courses/content';

const root = resolve(import.meta.dirname, '..');
const config = parse(readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8')) as {
  files: string[];
};
const filter = new FileMatcher(
  root,
  resolve(root, 'release'),
  (pattern) => pattern,
  config.files,
).createFilter();
const fileStats = statSync(import.meta.filename);
const included = (file: string) => filter(resolve(root, file), fileStats);

describe('desktop package files', () => {
  it.each([
    'dist/workbox-runtime.js',
    'dist/robots.txt',
    'dist/sitemap.xml',
    'dist/llms.txt',
  ])('excludes hosted-web-only output %s through the real packager filter', (file) => {
    expect(included(file)).toBe(false);
  });

  it('retains the service-worker entry used by desktop stale-chunk recovery', () => {
    expect(included('dist/sw.js')).toBe(true);
  });

  it.each(coursePaths)('excludes the hosted course page %s', (path) => {
    expect(included(`dist${path}index.html`)).toBe(false);
  });

  it.each([
    'dist/index.html',
    'dist/manifest.json',
    'dist/assets/app.js',
    'dist/assets/rawDatabaseSnapshot.js',
    'dist/assets/markdownAssetExtraction.js',
    'dist/assets/markdownAssets.js',
    'dist/assets/dailyBackup.worker.js',
    'dist/assets/trainer.wasm',
    'dist/fonts/InstrumentSans-OFL.txt',
    'electron/dist-electron/main.js',
    'electron/dist-electron/preload.cjs',
    'electron/dist-electron/mcp/server.js',
    'electron/dist-electron/mcp/companion.js',
    'electron/dist-electron/mcp/aiCompanion.js',
    'electron/dist-electron/mcp/aiCompanionEntry.js',
    'electron/dist-electron/mcp/chunk-runtime.js',
    'electron/dist-electron/mcp/THIRD-PARTY-LICENCES.txt',
  ])('retains runtime output and licences %s', (file) => {
    expect(included(file)).toBe(true);
  });

  it.each([
    'dist/assets/app.js.map',
    'electron/dist-electron/mcp/companionEntry.ts',
    'electron/dist-electron/mcp/companion.test.js',
  ])('keeps source and test output excluded: %s', (file) => {
    expect(included(file)).toBe(false);
  });
});
