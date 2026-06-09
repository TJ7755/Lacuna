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

    async function check() {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage ?? 0;
        const quota = est.quota ?? 0;
        if (quota > 0 && usage / quota > WARNING_THRESHOLD && !warnedRef.current) {
          warnedRef.current = true;
          notify(
            `Storage is ${Math.round((usage / quota) * 100)}% full. Consider exporting your data to free up space.`,
            'negative',
            { duration: 8000 },
          );
        }
      } catch {
        // estimate() may fail in some browsers; silently ignore.
      }
    }

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [notify]);
}
