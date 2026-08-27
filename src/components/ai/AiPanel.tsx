import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AiSession } from '../../ai/session/types';
import { Button } from '../ui/Button';
import { CloseIcon, SparklesIcon } from '../ui/icons';
import { AiApprovalCard } from './AiApprovalCard';
import { AiComposer } from './AiComposer';
import { AiConnectionState } from './AiConnectionState';
import { AiConversation } from './AiConversation';

export function AiPanel({ session, onClose }: { session: AiSession; onClose: () => void }) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const connection = snapshot.connection;
  const disconnected = connection.status === 'disconnected' || connection.status === 'pairing';
  const pendingApproval = snapshot.approval?.status === 'pending';
  const connectionLabel =
    connection.status === 'disconnected'
      ? 'Not connected'
      : connection.status === 'pairing'
        ? 'Waiting for terminal'
        : connection.status === 'quiet'
          ? 'Connection quiet'
          : connection.client.name;

  useEffect(() => {
    if (connection.status === 'disconnected') closeRef.current?.focus();
  }, [connection.status]);

  return (
    <aside
      aria-label="AI conversation"
      className="flex h-full w-[400px] shrink-0 flex-col border-r border-line bg-paper"
    >
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="flex min-h-11 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-paper text-accent">
            <SparklesIcon width={17} height={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg text-ink">AI</h1>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  disconnected
                    ? 'bg-ink-faint'
                    : snapshot.connection.status === 'quiet'
                      ? 'bg-warning'
                      : 'bg-positive'
                }`}
                aria-hidden="true"
              />
            </div>
            <p className="truncate text-xs text-ink-faint">{connectionLabel}</p>
          </div>
          {snapshot.activity &&
            ['working', 'awaiting_approval', 'stop_requested'].includes(
              snapshot.activity.status,
            ) && (
              <Button
                size="sm"
                variant="danger"
                disabled={snapshot.activity.status === 'stop_requested'}
                onClick={() => void session.stop(snapshot.activity!.runId)}
              >
                {snapshot.activity.status === 'stop_requested' ? 'Stop requested' : 'Stop'}
              </Button>
            )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close AI"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        {snapshot.activity && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate">{snapshot.activity.summary}</p>
              {snapshot.activity.detail && (
                <p className="mt-1 leading-5 text-ink-faint">{snapshot.activity.detail}</p>
              )}
            </div>
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {snapshot.activity
            ? [snapshot.activity.summary, snapshot.activity.detail].filter(Boolean).join('. ')
            : ''}
        </span>
      </header>

      {disconnected ? (
        <AiConnectionState
          pairing={connection.status === 'pairing' ? connection : null}
          busy={pairingBusy}
          error={
            pairingError ??
            (connection.status === 'disconnected' ? (connection.reason ?? null) : null)
          }
          onStartPairing={() => {
            setPairingBusy(true);
            setPairingError(null);
            void session.pair().then((result) => {
              setPairingBusy(false);
              if (!result.ok) setPairingError(result.error.message);
            });
          }}
          onCancel={() => {
            setPairingBusy(true);
            setPairingError(null);
            void session.resetConnection().then((result) => {
              setPairingBusy(false);
              if (!result.ok) setPairingError(result.error.message);
            });
          }}
        />
      ) : (
        <>
          <AiConversation items={snapshot.items} />
          {snapshot.approval && (
            <AiApprovalCard
              approval={snapshot.approval}
              session={session}
              autoFocus={pendingApproval}
            />
          )}
        </>
      )}

      <AiComposer
        session={session}
        disabled={disconnected}
        initialDraft={snapshot.draft}
        queuedFollowUp={snapshot.queuedFollowUp}
        autoFocus={!disconnected && !pendingApproval}
      />
    </aside>
  );
}
