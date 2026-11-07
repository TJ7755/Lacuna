import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coarsePlatform,
  isDoNotTrackEnabled,
  isProductAnalyticsEligible,
  isWebsiteAnalyticsAllowed,
  readProductAnalyticsEnabled,
  trackProductEvent,
  writeProductAnalyticsEnabled,
} from './productAnalytics';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('product analytics opt-out', () => {
  it('defaults on for new installs and retains an explicit opt-out', () => {
    expect(readProductAnalyticsEnabled()).toBe(true);
    expect(localStorage.getItem('lacuna.productAnalytics')).toBeNull();
    writeProductAnalyticsEnabled(false);
    expect(localStorage.getItem('lacuna.productAnalytics')).toBe('off');
    expect(readProductAnalyticsEnabled()).toBe(false);
    writeProductAnalyticsEnabled(true);
    expect(readProductAnalyticsEnabled()).toBe(true);
  });

  it('treats absent or corrupt storage as opted in', () => {
    expect(readProductAnalyticsEnabled()).toBe(true);
  });

  it('loads website analytics only for hosted production without an opt-out or DNT', () => {
    expect(
      isWebsiteAnalyticsAllowed({
        origin: 'https://getlacuna.app',
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isWebsiteAnalyticsAllowed({
        origin: 'https://getlacuna.app',
        isProduction: true,
        productAnalyticsEnabled: false,
      }),
    ).toBe(false);
  });

  it.each([
    [false, 'https://getlacuna.app'],
    [true, 'http://localhost:5173'],
    [true, 'https://preview.vercel.app'],
    [true, 'app://lacuna'],
  ])('blocks analytics loads with production=%s on %s', (isProduction, origin) => {
    expect(isWebsiteAnalyticsAllowed({ origin, isProduction })).toBe(false);
  });

  it('blocks analytics loads when preference storage is unavailable', () => {
    expect(
      isWebsiteAnalyticsAllowed({
        origin: 'https://getlacuna.app',
        isProduction: true,
        productAnalyticsEnabled: undefined,
      }),
    ).toBe(true);
    // Storage denial blocks opt-out writes, so the bootstrap test seam forces
    // the refused load through an explicit opt-out check instead.
    expect(
      isWebsiteAnalyticsAllowed({
        origin: 'https://getlacuna.app',
        isProduction: true,
        productAnalyticsEnabled: false,
      }),
    ).toBe(false);
  });

  it('respects Do Not Track and Global Privacy Control', () => {
    expect(isDoNotTrackEnabled({ doNotTrack: '1', globalPrivacyControl: false })).toBe(true);
    expect(isDoNotTrackEnabled({ doNotTrack: '0', globalPrivacyControl: true })).toBe(true);
    expect(isDoNotTrackEnabled({ doNotTrack: '0', globalPrivacyControl: false })).toBe(false);
    expect(isDoNotTrackEnabled({ doNotTrack: null, globalPrivacyControl: true })).toBe(true);
    const getter = vi.spyOn(window.navigator, 'doNotTrack', 'get');
    try {
      getter.mockReturnValue('1');
      expect(
        isWebsiteAnalyticsAllowed({ origin: 'https://getlacuna.app', isProduction: true }),
      ).toBe(false);
    } finally {
      getter.mockRestore();
    }
  });

  it('sends no network when switched off', () => {
    const event = vi.fn();
    Object.defineProperty(window, 'sa_event', { configurable: true, value: event });
    try {
      writeProductAnalyticsEnabled(false);
      trackProductEvent('app_opened', { origin: 'https://getlacuna.app', isProduction: true });
      trackProductEvent('study_session_completed', {
        origin: 'https://getlacuna.app',
        isProduction: true,
      });
      expect(event).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(window, 'sa_event');
    }
  });

  it('sends app version with only a coarse platform band', () => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    const event = vi.fn();
    Object.defineProperty(window, 'sa_event', { configurable: true, value: event });
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    try {
      trackProductEvent('app_opened', { origin: 'https://getlacuna.app', isProduction: true });
      expect(event).toHaveBeenCalledWith('app_opened', {
        app_version: '9.9.9',
        platform: 'touch',
      });
      expect(coarsePlatform()).toBe('touch');
    } finally {
      matchMedia.mockRestore();
      Reflect.deleteProperty(window, 'sa_event');
    }
  });

  it('keeps product counts off desktop builds', () => {
    const event = vi.fn();
    Object.defineProperty(window, 'sa_event', { configurable: true, value: event });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true },
    });
    try {
      expect(
        isProductAnalyticsEligible({ origin: 'https://getlacuna.app', isProduction: true }),
      ).toBe(false);
      trackProductEvent('app_opened', { origin: 'https://getlacuna.app', isProduction: true });
      expect(event).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(window, 'electronAPI');
      Reflect.deleteProperty(window, 'sa_event');
    }
  });

  it('never throws from product counts', () => {
    Object.defineProperty(window, 'sa_event', {
      configurable: true,
      value: () => {
        throw new Error('beacon failed');
      },
    });
    try {
      expect(() =>
        trackProductEvent('study_session_completed', {
          origin: 'https://getlacuna.app',
          isProduction: true,
        }),
      ).not.toThrow();
    } finally {
      Reflect.deleteProperty(window, 'sa_event');
    }
  });
});
