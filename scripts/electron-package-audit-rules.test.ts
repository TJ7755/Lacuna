import { describe, expect, it } from 'vitest';

import {
  isWindowsAsarPath,
  packageAssetKind,
  selectAsarCandidate,
} from './electron-package-audit-rules';

describe('Electron package audit rules', () => {
  it.each([
    'node_modules/example/index.d.ts',
    'node_modules/example/index.d.cts',
    'node_modules/example/index.d.mts',
    'node_modules/example/source.ts',
    'node_modules/example/source.tsx',
    'node_modules/example/README.md',
    'node_modules/example/component.test.js',
  ])('classifies %s as build-only', (path) => {
    expect(packageAssetKind(path)).toBe('build-only');
  });

  it('classifies source maps before their declaration-file suffix', () => {
    expect(packageAssetKind('node_modules/example/index.d.cts.map')).toBe('source-map');
  });

  it('leaves executable JavaScript in the runtime payload', () => {
    expect(packageAssetKind('node_modules/example/index.js')).toBe('runtime');
  });

  it('requires an unambiguous automatic ASAR candidate', () => {
    expect(selectAsarCandidate(['release/win-unpacked/resources/app.asar'])).toBe(
      'release/win-unpacked/resources/app.asar',
    );
    expect(() => selectAsarCandidate([])).toThrow('No release app.asar found');
    expect(() =>
      selectAsarCandidate([
        'release/mac/Lacuna.app/Contents/Resources/app.asar',
        'release/win-unpacked/resources/app.asar',
      ]),
    ).toThrow('Multiple release app.asar files found');
  });

  it('recognises only the Windows unpacked package as the Windows budget target', () => {
    expect(isWindowsAsarPath('release/win-unpacked/resources/app.asar')).toBe(true);
    expect(isWindowsAsarPath('C:\\build\\release\\win-unpacked\\resources\\app.asar')).toBe(true);
    expect(isWindowsAsarPath('release/linux-unpacked/resources/app.asar')).toBe(false);
    expect(isWindowsAsarPath('release/mac/Lacuna.app/Contents/Resources/app.asar')).toBe(false);
  });
});
