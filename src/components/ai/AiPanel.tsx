import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { AiSession } from '../../ai/session/types';
import { Button } from '../ui/Button';
import { CloseIcon, SparklesIcon } from '../ui/icons';
import { AiApprovalCard } from './AiApprovalCard';
import { AiComposer } from './AiComposer';
import { AiConversation } from './AiConversation';

export function AiPanel({ session, onClose }: { session: AiSession; onClose: () => void }) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const connection = snapshot.connection;
  const disconnected = connection.status === 'disconnected';
  const pendingApproval = snapshot.approval?.status === 'pending';
  const connectionLabel =
    connection.status === 'disconnected'
      ? 'Not connected'
      : connection.status === 'quiet'
        ? 'Connection quiet'
        : connection.client.name;

  useEffect(() => {
    if (disconnected || pendingApproval) closeRef.current?.focus();
  }, [disconnected, pendingApproval]);

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
            <p className="truncate text-xs text-ink-faint">
              {connectionLabel}
            </p>
          </div>
          {snapshot.activity && ['working', 'awaiting_approval', 'stop_requested'].includes(snapshot.activity.status) && (
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
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate">{snapshot.activity.summary}</span>
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {snapshot.activity?.summary ?? ''}
        </span>
      </header>

      {disconnected ? (
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Connection</p>
            <h2 className="mt-2 font-display text-2xl text-ink">Waiting for AI</h2>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              Start a compatible browser-control session in your terminal and attach it to this Lacuna tab. The model and terminal harness are your choice.
            </p>
            {connection.status === 'disconnected' && connection.reason && (
              <p className="mt-4 rounded-xl border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
                {connection.reason}
              </p>
            )}
          </div>
          <div className="mt-8 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-medium text-ink">Keep this tab open</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              Lacuna exposes the AI bridge only while this device-local feature is enabled.
            </p>
          </div>
        </div>
      ) : (
        <>
          <AiConversation items={snapshot.items} />
          {snapshot.approval && <AiApprovalCard approval={snapshot.approval} session={session} />}
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
