import { useCallback, useRef } from 'react';
import { useToast } from '../components/ui/Toast';
import { saveDraft } from './drafts';

/** Report an unprotected draft once until storage recovers. */
export function useDraftStorage() {
  const { notify } = useToast();
  const warned = useRef(false);
  return useCallback(
    function storeDraft<T>(key: string, data: T): boolean {
      const stored = saveDraft(key, data);
      if (!stored && !warned.current) {
        notify(
          'Could not save your draft. Keep this page open and save your work before leaving.',
          'negative',
        );
      }
      warned.current = !stored;
      return stored;
    },
    [notify],
  );
}
