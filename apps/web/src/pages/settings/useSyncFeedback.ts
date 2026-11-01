import { useEffect, useRef, useState } from 'react';
import { useActionFocus } from '../../hooks/useActionFocus';
import { syncFeedback, type SyncFeedback } from './syncFeedback';

export function useSyncFeedback(busy: string | null, pairOpen: boolean) {
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);
  const completion = useRef<string | null>(null);
  const retry = useRef<HTMLElement | null>(null);
  const { remember, restore } = useActionFocus();

  useEffect(() => {
    if (busy || pairOpen || !completion.current) return;
    restore(document.getElementById(completion.current));
    completion.current = null;
  }, [busy, pairOpen, restore]);

  useEffect(() => {
    if (busy || !feedback) return;
    restore(feedback.field ? document.getElementById(feedback.field) : retry.current);
  }, [busy, feedback, restore]);

  return {
    feedback,
    clear: () => setFeedback(null),
    begin: () => {
      setFeedback(null);
      retry.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      remember();
    },
    complete: (target: string) => {
      completion.current = target;
    },
    fail: (error: unknown, fallback: string) => {
      const next = syncFeedback(error, fallback, 'sync-action');
      setFeedback(next);
    },
  };
}
