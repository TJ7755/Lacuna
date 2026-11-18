import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '../../../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const builderConfig = readFileSync(
  resolve(root, 'apps/desktop/electron-builder.yml'),
  'utf8',
).replace(/\r\n/g, '\n');

const packagedRuntimeDependencies = ['electron-log', 'electron-updater'] as const;

const builder = parse(builderConfig) as {
  electronLanguages: string[];
  electronFuses: { runAsNode: boolean; grantFileProtocolExtraPrivileges: boolean };
};

describe('Electron package boundary', () => {
  it('ships only the dependencies required by Electron after the renderer is bundled', () => {
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual(
      [...packagedRuntimeDependencies].sort(),
    );
  });

  it('retains third-party licence notices', () => {
    expect(builderConfig).not.toMatch(/!.*(?:LICEN[CS]E|COPYING|NOTICE)/i);
  });

  it('ships only the supported English Chromium locale packs', () => {
    expect(builder.electronLanguages).toEqual(['en-GB', 'en-US']);
  });
});

describe('Electron fuses', () => {
  it('drops file:// privileges but keeps RunAsNode for the AI companion', () => {
    expect(builder.electronFuses).toMatchObject({
      runAsNode: true,
      grantFileProtocolExtraPrivileges: false,
    });
  });
});
