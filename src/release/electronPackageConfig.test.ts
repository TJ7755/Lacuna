import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const builderConfig = readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8');

const packagedRuntimeDependencies = ['electron-log', 'electron-updater'] as const;

const buildOnlyDependencies = [
  '@modelcontextprotocol/client',
  '@modelcontextprotocol/server',
  'zod',
  '@napi-rs/wasm-runtime',
  '@open-spaced-repetition/binding',
  '@vercel/analytics',
  'dexie',
  'dexie-react-hooks',
  'fflate',
  'html5-qrcode',
  'katex',
  'mathjs',
  'motion',
  'react',
  'react-dom',
  'react-markdown',
  'react-qr-code',
  'react-router-dom',
  'recharts',
  'rehype-highlight',
  'rehype-katex',
  'rehype-raw',
  'rehype-sanitize',
  'remark-breaks',
  'remark-gfm',
  'remark-math',
  'sql.js',
  'ts-fsrs',
] as const;

describe('Electron package boundary', () => {
  it('ships only the dependencies required by Electron after the renderer is bundled', () => {
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual(
      [...packagedRuntimeDependencies].sort(),
    );

    for (const dependency of buildOnlyDependencies) {
      expect(packageJson.devDependencies?.[dependency]).toBeTypeOf('string');
    }
    expect(packageJson.dependencies?.['@modelcontextprotocol/core']).toBeUndefined();
    expect(packageJson.devDependencies?.['@modelcontextprotocol/core']).toBeUndefined();
  });

  it('packages runtime assets while excluding build artefacts and retaining licence files', () => {
    expect(builderConfig).toContain('  - electron/assets/fonts/**/*');
    expect(builderConfig).not.toContain('  - electron/assets/**/*');
    expect(builderConfig).toContain("  - '!**/*.map'");
    expect(builderConfig).toContain("  - '!**/*.{ts,tsx,cts,mts,jsx,tsbuildinfo}'");
    expect(builderConfig).toContain(
      "  - '!**/{__tests__,__mocks__,test,tests,coverage,test-results,storybook}/**/*'",
    );
    expect(builderConfig).toContain("  - '!**/*.{test,spec}.{js,cjs,mjs,ts,tsx,cts,mts,jsx}'");
    expect(builderConfig).toContain(
      "  - '!**/{README*,CHANGELOG*,CHANGES*,HISTORY*,CONTRIBUTING*,CODE_OF_CONDUCT*,SECURITY*}.{md,markdown,txt}'",
    );
    expect(builderConfig).not.toMatch(/!.*(?:LICEN[CS]E|COPYING|NOTICE)/i);
  });

  it('ships only the supported English Chromium locale packs', () => {
    expect(builderConfig).toMatch(/electronLanguages:\n {2}- en-GB\n {2}- en-US(?:\n|$)/);
  });
});
