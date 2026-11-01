import { afterEach, describe, expect, it, vi } from 'vitest';
import { quickSearchShortcutLabel } from './runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quickSearchShortcutLabel', () => {
  it.each([
    ['darwin', '⌘K'],
    ['win32', 'Ctrl+K'],
    ['linux', 'Ctrl+K'],
  ])('uses the trusted Electron %s platform', (electronPlatform, expected) => {
    expect(
      quickSearchShortcutLabel({
        electronPlatform,
        browserPlatform: 'MacIntel',
        browserUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      }),
    ).toBe(expected);
  });

  it.each([
    ['MacIntel', 'Mozilla/5.0', '⌘K'],
    ['', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '⌘K'],
    ['Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Ctrl+K'],
    ['Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)', 'Ctrl+K'],
    ['', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Ctrl+K'],
  ])(
    'uses a conservative browser fallback for platform %j and user agent %j',
    (browserPlatform, browserUserAgent, expected) => {
      expect(quickSearchShortcutLabel({ browserPlatform, browserUserAgent })).toBe(expected);
    },
  );

  it('is safe without browser or Electron globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);

    expect(quickSearchShortcutLabel()).toBe('Ctrl+K');
  });
});
