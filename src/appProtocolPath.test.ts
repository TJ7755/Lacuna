import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppAssetPath } from '../electron/appProtocolPath';

const DIST_PATH = path.resolve('/tmp/lacuna-dist');

describe('packaged app protocol paths', () => {
  it('resolves a renderer reload without treating its hash as part of the file path', () => {
    expect(resolveAppAssetPath('app://./index.html#/', DIST_PATH)).toEqual({
      ok: true,
      path: path.join(DIST_PATH, 'index.html'),
    });
  });

  it('resolves assets beneath the trusted renderer authority', () => {
    expect(resolveAppAssetPath('app://./assets/index.js?v=1', DIST_PATH)).toEqual({
      ok: true,
      path: path.join(DIST_PATH, 'assets', 'index.js'),
    });
  });

  it.each([
    'app://../../../etc/passwd',
    'app:///index.html',
    'app://attacker/index.html',
    'app://./..%2Fsecrets',
  ])('rejects untrusted or escaping paths: %s', (requestUrl) => {
    expect(resolveAppAssetPath(requestUrl, DIST_PATH)).toEqual({ ok: false, status: 403 });
  });

  it('rejects malformed URL escapes', () => {
    expect(resolveAppAssetPath('app://./%zz', DIST_PATH)).toEqual({
      ok: false,
      status: 400,
    });
  });
});
