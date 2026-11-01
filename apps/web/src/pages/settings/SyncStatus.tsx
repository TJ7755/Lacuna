import type { SyncState } from '../../db/types';
import { formatDateTime, formatRelativeTime } from '../../utils/datetime';
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';

function formatBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

export function StatusPanel({ state }: { state: SyncState }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-positive">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-hidden="true" />
          Paired to a sync channel
        </span>
        {state.lastSuccessfulSyncAt ? (
          <span className="text-ink-soft" title={formatDateTime(state.lastSuccessfulSyncAt)}>
            Last synced {formatRelativeTime(state.lastSuccessfulSyncAt)}
          </span>
        ) : (
          <span className="text-ink-soft">Not synced yet</span>
        )}
      </div>
      {state.lastError && (
        <p role="alert" className="mt-3 rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.lastError}
        </p>
      )}
    </div>
  );
}

export function SyncDetails({ state }: { state: SyncState }) {
  const encrypted = formatBytes(state.lastSnapshotBytes);
  const plaintext = formatBytes(state.lastSnapshotPlaintextBytes);
  return (
    <InlineSettingsDisclosure
      header="End-to-end encrypted"
      headerClassName="flex min-h-11 items-center justify-between gap-3 rounded-lg text-sm text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <div className="space-y-2 pb-3 pt-1 text-sm text-ink-soft">
        <p>Keeps paired devices up to date. Export a backup for a separate copy.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 break-all text-xs">
          <span>{state.relayUrl ?? 'Relay not recorded'}</span>
          <span>{state.channelId ?? 'channel unavailable'}</span>
        </div>
        {(encrypted || plaintext) && (
          <p className="text-xs">
            Last snapshot: {encrypted ? `${encrypted} encrypted` : 'encrypted size unknown'}
            {plaintext ? ` · ${plaintext} before encryption` : ''}
          </p>
        )}
      </div>
    </InlineSettingsDisclosure>
  );
}
