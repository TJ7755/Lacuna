import { useEffect, useRef } from 'react';
import { useToast } from '../components/ui/Toast';

const WARNING_THRESHOLD = 0.85;
const CHECK_INTERVAL_MS = 60_000;

/**
 * Periodically checks the browser's storage quota and shows a toast
 * when usage is above the warning threshold. Only warns once per session.
 */
export function useStorageQuotaWarning() {
  const { notify } = useToast();
  const warnedRef = useRef(false);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return;
    }

    let active = true;
    async function check() {
      try {
        const est = await navigator.storage.estimate();
        if (!active) return;
        const usage = est.usage ?? 0;
        const quota = est.quota ?? 0;
        if (quota > 0 && usage / quota > WARNING_THRESHOLD && !warnedRef.current) {
          warnedRef.current = true;
          notify(
            `Storage is ${Math.round((usage / quota) * 100)}% full. Export a backup before removing unused content.`,
            'negative',
            {
              persistent: true,
              actionLabel: 'Open export',
              onAction: () => {
                window.location.hash = '#/settings#settings-export';
              },
            },
          );
        }
      } catch {
        // estimate() may fail in some browsers; silently ignore.
      }
    }

    void check();
    const interval = window.setInterval(() => {
      void check();
    }, CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [notify]);
}
