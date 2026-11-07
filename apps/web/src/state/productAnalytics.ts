import { createLocalSetting } from './localSetting';

// Anonymous product counts for hosted web only (#1192). Device-local opt-out:
// absent means on, only an explicit 'off' disables collection. Existing learners
// keep behaviour until they opt out; new installs default on. Nothing here leaves
// the device except cookieless Simple Analytics custom-event counts when the
// eligibility checks pass. No content, identifiers or account linkage is stored.

export type ProductAnalyticsEvent =
  'app_opened' | 'onboarding_completed' | 'study_session_completed' | 'error_boundary_shown';

export const PRODUCT_ANALYTICS_EVENTS: Record<ProductAnalyticsEvent, string> = {
  app_opened: 'app_opened',
  onboarding_completed: 'onboarding_completed',
  study_session_completed: 'study_session_completed',
  error_boundary_shown: 'error_boundary_shown',
};

declare global {
  interface Window {
    sa_event?: (name: string, metadata?: Record<string, string>) => void;
  }
}

const setting = createLocalSetting<boolean>({
  key: 'lacuna.productAnalytics',
  event: 'lacuna:product-analytics',
  parse: (raw) => raw !== 'off',
  serialise: (enabled) => (enabled ? 'on' : 'off'),
});

export const readProductAnalyticsEnabled = setting.read;
export const writeProductAnalyticsEnabled = setting.write;
export const useProductAnalyticsEnabled = setting.use;

/** Respect Do Not Track and Global Privacy Control before any product count. */
export function isDoNotTrackEnabled(
  navigatorLike?: Pick<Navigator, 'doNotTrack'> &
    Partial<Record<'globalPrivacyControl', unknown>> & {
      msDoNotTrack?: string | null;
    },
): boolean {
  try {
    const scope: unknown =
      typeof navigatorLike === 'object' && navigatorLike !== null
        ? navigatorLike
        : typeof window !== 'undefined'
          ? window.navigator
          : undefined;
    if (!scope || typeof scope !== 'object') return false;
    const record = scope as Record<string, unknown>;
    const dnt = record.doNotTrack ?? record.msDoNotTrack ?? null;
    if (dnt === '1' || dnt === 'yes') return true;
    return record.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** Whether this page may load website analytics: hosted web, opted in, no DNT. */
export function isWebsiteAnalyticsAllowed({
  origin = window.location.origin,
  isProduction = import.meta.env.PROD,
  productAnalyticsEnabled,
}: {
  origin?: string;
  isProduction?: boolean;
  /** Test seam for the device opt-out; defaults to the stored preference. */
  productAnalyticsEnabled?: boolean;
} = {}): boolean {
  if (!isProduction || origin !== 'https://getlacuna.app') return false;
  try {
    const enabled = productAnalyticsEnabled ?? readProductAnalyticsEnabled();
    if (!enabled) return false;
  } catch {
    // A caller that cannot read or write the device preference cannot prove
    // consent; product counts stay off while website page views follow the
    // same device switch once storage returns.
    return false;
  }
  return !isDoNotTrackEnabled();
}

/** Coarse touch/desktop band, not a fingerprint: no user agent leaves the device. */
export function coarsePlatform(): 'touch' | 'desktop' {
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';
  } catch {
    return 'desktop';
  }
}

declare const __APP_VERSION__: string;

function appVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export interface ProductAnalyticsEnvironment {
  origin: string;
  isProduction: boolean;
  isElectron: boolean;
  enabled: boolean;
  doNotTrack: boolean;
}

export function readProductAnalyticsEnvironment({
  origin = window.location.origin,
  isProduction = import.meta.env.PROD,
}: {
  origin?: string;
  isProduction?: boolean;
} = {}): ProductAnalyticsEnvironment {
  let enabled = true;
  try {
    enabled = readProductAnalyticsEnabled();
  } catch {
    enabled = true;
  }
  let isElectron = false;
  try {
    isElectron = window.electronAPI?.isElectron === true;
  } catch {
    isElectron = false;
  }
  return {
    origin,
    isProduction,
    isElectron,
    enabled,
    doNotTrack: isDoNotTrackEnabled(),
  };
}

/** Hosted web only: production getlacuna.app, opted in, no DNT/GPC, no desktop. */
export function isProductAnalyticsEligible(
  environment?: Partial<ProductAnalyticsEnvironment>,
): boolean {
  const current = { ...readProductAnalyticsEnvironment(), ...environment };
  if (!current.isProduction) return false;
  if (current.origin !== 'https://getlacuna.app') return false;
  if (current.isElectron) return false;
  if (!current.enabled) return false;
  if (current.doNotTrack) return false;
  return true;
}

/** Send one cookieless product count via Simple Analytics custom events. */
export function trackProductEvent(
  name: ProductAnalyticsEvent,
  environment?: Partial<ProductAnalyticsEnvironment>,
): void {
  if (!isProductAnalyticsEligible(environment)) return;
  const payload = (() => {
    try {
      return {
        app_version: appVersion(),
        platform: coarsePlatform(),
      };
    } catch {
      return null;
    }
  })();
  if (!payload) return;
  try {
    window.sa_event?.(PRODUCT_ANALYTICS_EVENTS[name], payload);
  } catch {
    // Product counts must never break study.
  }
}
