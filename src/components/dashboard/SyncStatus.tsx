import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readSyncState } from '../../db/mutationStamp';
import type { SyncState } from '../../db/types';
import { formatRelativeTime } from '../../utils/datetime';

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);
  const navigate = useNavigate();

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

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className="mb-6 flex w-full items-center justify-between rounded-xl border border-line bg-surface-raised/30 px-4 py-3 text-left transition-colors hover:bg-surface-raised/50"
    >
      <span className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-positive" aria-hidden="true" />
        <span className="text-ink-soft">{label}</span>
        {state.lastError && <span className="text-xs text-negative">· Sync failed</span>}
      </span>
      <span className="text-xs text-accent">Open sync</span>
    </button>
  );
}
