import { useSyncExternalStore } from 'react';
import { createLocalSetting } from '../state/localSetting';

const setting = createLocalSetting({
  key: 'lacuna.usageAnalytics',
  event: 'lacuna:usage-analytics',
  parse: (raw): boolean | null => (raw === '1' ? true : raw === '0' ? false : null),
  serialise: (enabled) => (enabled ? '1' : '0'),
});

let writeFailed = false;

export function usageAnalyticsAvailable(): boolean {
  return (
    import.meta.env.PROD &&
    import.meta.env.VITE_USAGE_ANALYTICS_ENABLED !== 'false' &&
    typeof window !== 'undefined' &&
    window.location.origin === 'https://getlacuna.app' &&
    !window.electronAPI?.isElectron
  );
}

function browserBlocksUsage(): boolean {
  return (
    navigator.doNotTrack === '1' ||
    navigator.doNotTrack === 'yes' ||
    ('doNotTrack' in window && window.doNotTrack === '1') ||
    ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true)
  );
}

type UsagePreference = 'on' | 'off' | 'unset' | 'unavailable';

export function readUsagePreference(): UsagePreference {
  if (writeFailed) return 'unavailable';
  try {
    const enabled = setting.read();
    return enabled === null ? 'unset' : enabled ? 'on' : 'off';
  } catch {
    return 'unavailable';
  }
}

export function canCollectUsage(): boolean {
  return usageAnalyticsAvailable() && !browserBlocksUsage() && readUsagePreference() === 'on';
}

export function subscribeToUsagePreference(onChange: () => void): () => void {
  const unsubscribe = setting.subscribe(onChange);
  window.addEventListener('focus', onChange);
  window.addEventListener('pageshow', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    unsubscribe();
    window.removeEventListener('focus', onChange);
    window.removeEventListener('pageshow', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

export function useUsagePreference(): UsagePreference {
  return useSyncExternalStore(subscribeToUsagePreference, readUsagePreference, () => 'unavailable');
}

export function useUsagePrivacyBlocked(): boolean {
  return useSyncExternalStore(subscribeToUsagePreference, browserBlocksUsage, () => true);
}

export function saveUsagePreference(enabled: boolean): void {
  if (!usageAnalyticsAvailable()) return;
  try {
    setting.write(enabled && !browserBlocksUsage());
  } catch {
    // A refused write must never enable collection. Clearing any previous On value also
    // stops other tabs and future loads if the browser still permits deletion.
    writeFailed = true;
    try {
      localStorage.removeItem(setting.key);
    } catch {
      // Storage itself may have become inaccessible.
    }
    window.dispatchEvent(new Event(setting.event));
  }
}
