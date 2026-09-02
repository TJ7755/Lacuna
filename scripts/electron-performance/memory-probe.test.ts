import { describe, expect, it } from 'vitest';
import { parseRuntimeVersionsFromUserAgent } from './memory-probe';

describe('packaged renderer runtime identification', () => {
  it('reads exact Electron and Chromium versions from an Electron renderer user agent', () => {
    expect(
      parseRuntimeVersionsFromUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Lacuna/0.2.3 Chrome/144.0.7559.109 Electron/42.0.0 Safari/537.36',
      ),
    ).toEqual({ electron: '42.0.0', chromium: '144.0.7559.109' });
  });

  it.each([
    'Mozilla/5.0 Chrome/144.0.7559.109 Safari/537.36',
    'Mozilla/5.0 Chrome/144 Electron/42.0.0 Safari/537.36',
    'Mozilla/5.0 Chrome/144.0.7559.109 Electron/42 Safari/537.36',
    'Mozilla/5.0 Chrome/144.0.7559.109 Chrome/145.0.0.0 Electron/42.0.0',
  ])('rejects a renderer user agent without one exact version pair: %s', (userAgent) => {
    expect(() => parseRuntimeVersionsFromUserAgent(userAgent)).toThrow(
      'Could not identify one exact Electron and Chromium version',
    );
  });
});
