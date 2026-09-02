import { describe, expect, it } from 'vitest';
import { appAsarPathForExecutable } from './packaged-artifact';

describe('packaged memory artefact provenance', () => {
  it('resolves the packaged app.asar beside each platform executable', () => {
    expect(
      appAsarPathForExecutable('/Applications/Lacuna.app/Contents/MacOS/Lacuna', 'darwin'),
    ).toBe('/Applications/Lacuna.app/Contents/Resources/app.asar');
    expect(appAsarPathForExecutable('C:\\Lacuna\\Lacuna.exe', 'win32')).toBe(
      'C:\\Lacuna\\resources\\app.asar',
    );
    expect(appAsarPathForExecutable('/opt/lacuna/lacuna', 'linux')).toBe(
      '/opt/lacuna/resources/app.asar',
    );
  });
});
