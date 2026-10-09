import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallPrompt } from './useInstallPrompt';

const IPHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Temporarily override a navigator property, restoring it however the body exits. */
function withNavigatorProperty(name: string, value: unknown, body: () => void): void {
  const original = Object.getOwnPropertyDescriptor(navigator, name);
  Object.defineProperty(navigator, name, { value, configurable: true });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(navigator, name, original);
    else delete (navigator as unknown as Record<string, unknown>)[name];
  }
}

function createMediaQueryList(matches: boolean) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

describe('useInstallPrompt', () => {
  it('returns initial state', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(false));
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(typeof result.current.promptInstall).toBe('function');
    window.matchMedia = originalMatchMedia;
  });

  it('detects installed state when display-mode is standalone', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(true));
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstalled).toBe(true);
    window.matchMedia = originalMatchMedia;
  });

  it('reports no install route on a browser that cannot install', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(false));
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.method).toBe('unavailable');
    window.matchMedia = originalMatchMedia;
  });

  it('reports the manual route on iPhone, where beforeinstallprompt never fires', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(false));
    withNavigatorProperty('userAgent', IPHONE_USER_AGENT, () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.method).toBe('manual-ios');
      expect(result.current.isInstallable).toBe(false);
    });
    window.matchMedia = originalMatchMedia;
  });

  // iPadOS reports itself as a desktop Mac, so only the touch-point count separates
  // the two. Getting this wrong shows Mac users an iPhone gesture they cannot perform.
  it('reports the manual route on iPadOS but not on a desktop Mac', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(false));

    withNavigatorProperty('platform', 'MacIntel', () => {
      withNavigatorProperty('maxTouchPoints', 5, () => {
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.method).toBe('manual-ios');
      });
      withNavigatorProperty('maxTouchPoints', 0, () => {
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.method).toBe('unavailable');
      });
    });

    window.matchMedia = originalMatchMedia;
  });

  it('detects installed state from the legacy iOS standalone flag', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(false));
    withNavigatorProperty('standalone', true, () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isInstalled).toBe(true);
    });
    window.matchMedia = originalMatchMedia;
  });
});

it('consumes a dismissed install prompt until the browser supplies a new event', async () => {
  const { result } = renderHook(() => useInstallPrompt());
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: '' }),
  });
  await act(() => window.dispatchEvent(event));
  expect(result.current.isInstallable).toBe(true);
  await act(() => result.current.promptInstall());
  expect(result.current.isInstalled).toBe(false);
  expect(result.current.isInstallable).toBe(false);
  await act(() => result.current.promptInstall());
  expect(prompt).toHaveBeenCalledTimes(1);
  await act(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  expect(result.current.isInstallable).toBe(true);
});

it('consumes an install event before concurrent clicks can prompt it twice', async () => {
  const { result } = renderHook(() => useInstallPrompt());
  const finishPrompts: (() => void)[] = [];
  const prompt = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishPrompts.push(resolve);
      }),
  );
  await act(() =>
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      }),
    ),
  );
  await act(async () => {
    const first = result.current.promptInstall();
    const second = result.current.promptInstall();
    finishPrompts.forEach((finish) => finish());
    await Promise.all([first, second]);
  });
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(result.current.isInstalled).toBe(true);
});

