import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readSyncState } from '../../db/mutationStamp';
import type { SyncState } from '@lacuna/core/db/types';
import { formatRelativeTime } from '../../utils/datetime';

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    let active = true;
    void readSyncState()
      .then((value) => {
        if (!active) return;
        setState(value ?? null);
      })
      .catch(() => {
        if (!active) return;
        setState(null);
      });
    const interval = window.setInterval(() => {
      void readSyncState()
        .then((value) => {
          if (!active) return;
          setState(value ?? null);
        })
        .catch(() => {});
    }, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void readSyncState()
          .then((value) => {
            if (!active) return;
            setState(value ?? null);
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (!state?.channelId) return null;

  const label = state.lastSuccessfulSyncAt
    ? `Synced ${formatRelativeTime(state.lastSuccessfulSyncAt)}`
    : 'Not yet synced';
  const needsAttention = Boolean(state.lastError) || !state.lastSuccessfulSyncAt;
  const accessibleLabel = `${label}${state.lastError ? ' · Sync failed' : ''} · Open sync`;
  const tone = state.lastError
    ? 'bg-negative/10 px-3 text-negative hover:bg-negative/15'
    : needsAttention
      ? 'bg-warning/10 px-3 text-warning-fg hover:bg-warning/15'
      : 'w-11 text-ink-soft hover:bg-ink/[0.04] sm:w-auto sm:px-2';

  return (
    <Link
      to="/settings"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full text-xs ${tone}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${needsAttention ? 'bg-current' : 'bg-positive'}`}
        aria-hidden="true"
      />
      <span className={needsAttention ? undefined : 'max-sm:hidden'}>
        {state.lastError ? 'Sync failed' : label}
      </span>
    </Link>
  );
}
