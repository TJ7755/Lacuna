import { describe, expect, it } from 'vitest';
import type { OutputBundle, OutputChunk } from 'rollup';
import { inspectSettingsStaticClosure } from '../../scripts/settings-static-closure';

function chunk({
  fileName,
  imports = [],
  modules,
  code = '',
  isEntry = false,
}: {
  fileName: string;
  imports?: string[];
  modules: string[];
  code?: string;
  isEntry?: boolean;
}): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    imports,
    modules: Object.fromEntries(modules.map((id) => [id, {}])),
    code,
    isEntry,
  } as OutputChunk;
}

describe('Settings static closure inspection', () => {
  it('measures only incremental Settings chunks and reports action-only imports', () => {
    const bundle = {
      'app.js': chunk({
        fileName: 'app.js',
        imports: ['vendor.js'],
        modules: ['/repo/src/main.tsx'],
        code: 'app',
        isEntry: true,
      }),
      'vendor.js': chunk({
        fileName: 'vendor.js',
        modules: ['/repo/node_modules/react/index.js'],
        code: 'vendor',
      }),
      'Settings.js': chunk({
        fileName: 'Settings.js',
        imports: ['vendor.js', 'pairing.js'],
        modules: ['/repo/src/pages/Settings.tsx'],
        code: 'settings',
      }),
      'pairing.js': chunk({
        fileName: 'pairing.js',
        modules: ['/repo/src/sync/pairing.ts'],
        code: 'pairing',
      }),
    } as OutputBundle;

    const report = inspectSettingsStaticClosure(bundle);

    expect(report.chunks).toEqual(['Settings.js', 'pairing.js']);
    expect(report.rawBytes).toBe(Buffer.byteLength('settings\npairing'));
    expect(report.forbiddenModules).toEqual(['/repo/src/sync/pairing.ts']);
  });

  it('rejects a build that folds Settings into the eager entry closure', () => {
    const bundle = {
      'app.js': chunk({
        fileName: 'app.js',
        imports: ['vendor.js'],
        modules: ['/repo/src/main.tsx', '/repo/src/pages/Settings.tsx'],
        code: 'app settings',
        isEntry: true,
      }),
      'vendor.js': chunk({
        fileName: 'vendor.js',
        modules: ['/repo/node_modules/react/index.js'],
        code: 'vendor',
      }),
    } as OutputBundle;

    expect(() => inspectSettingsStaticClosure(bundle)).toThrow(
      'Settings is part of the eager application closure; expected a lazy Settings chunk.',
    );
  });
});
