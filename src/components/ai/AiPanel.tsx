import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AiSession } from '../../ai/session/types';
import { Button } from '../ui/Button';
import { ChevronDownIcon, CloseIcon, SparklesIcon } from '../ui/icons';
import type { AiWindowControls } from './AiFloatingWindow';
import { AiApprovalCard } from './AiApprovalCard';
import { AiComposer } from './AiComposer';
import { AiConnectionState } from './AiConnectionState';
import { AiConversation } from './AiConversation';
import { isElectronRuntime } from '../../electron/runtime';

export function AiPanel({
  session,
  onClose,
  window: windowControls,
}: {
  session: AiSession;
  onClose: () => void;
  /** Present when the panel is the floating window: the header becomes its drag handle. */
  window?: AiWindowControls;
}) {
  const minimised = windowControls?.minimised ?? false;
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connection = snapshot.connection;
  const hosted = session.provider === 'hosted';
  const local = isElectronRuntime() && !hosted;
  const disconnected = connection.status === 'disconnected' || connection.status === 'pairing';
  const pendingApproval = snapshot.approval?.status === 'pending';
  const stoppableRun =
    snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
      ? snapshot.run
      : null;
  const connectionLabel =
    connection.status === 'disconnected'
      ? local
        ? 'Waiting for AI client'
        : 'Not connected'
      : connection.status === 'pairing'
        ? 'Waiting for AI client'
        : connection.status === 'hosted'
          ? 'Built-in AI connected'
          : connection.status === 'quiet'
            ? 'Connection quiet'
            : connection.client.name;

  useEffect(() => {
    if (connection.status === 'disconnected') closeRef.current?.focus();
  }, [connection.status]);

  const resetConnection = () => {
    setConnectionBusy(true);
    setConnectionError(null);
    void session.resetConnection().then((result) => {
      setConnectionBusy(false);
      if (!result.ok) setConnectionError(result.error.message);
    });
  };

  return (
    <aside
      aria-label="AI conversation"
      className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_24px_56px_-24px_hsl(var(--ink)/0.4)]"
    >
      <header
        {...windowControls?.handleProps}
        title={windowControls ? 'Drag to move' : undefined}
        className={`bg-surface px-4 py-3 ${
          windowControls ? (windowControls.dragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        } touch-none select-none`}
      >
        <div className="flex min-h-11 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
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
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-xs text-ink-faint">{connectionLabel}</p>
              {!disconnected && (
                <button
                  type="button"
                  aria-label={hosted ? 'Sign out of built-in AI' : 'Disconnect AI client'}
                  disabled={connectionBusy}
                  onClick={resetConnection}
                  className="min-h-6 shrink-0 rounded px-1 py-0.5 text-xs font-medium text-ink-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40"
                >
                  {connectionBusy ? 'Disconnecting' : hosted ? 'Sign out' : 'Disconnect'}
                </button>
              )}
            </div>
          </div>
          {stoppableRun && (
            <Button
              size="sm"
              variant="danger"
              disabled={stoppableRun.status === 'stop_requested'}
              onClick={() => void session.stop(stoppableRun.runId)}
            >
              {stoppableRun.status === 'stop_requested' ? 'Stop requested' : 'Stop'}
            </Button>
          )}
          {windowControls && (
            <button
              type="button"
              onClick={windowControls.onToggleMinimise}
              aria-label={minimised ? 'Expand AI' : 'Minimise AI'}
              aria-expanded={!minimised}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <ChevronDownIcon
                width={18}
                height={18}
                className={`transition-transform ${minimised ? 'rotate-180' : ''}`}
                style={{ transitionDuration: `${0.2 * windowControls.multiplier}s` }}
              />
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close AI"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        {snapshot.activity && (
          <div className="mt-2 flex items-start gap-2 rounded-2xl bg-paper px-3 py-2 text-xs text-ink-soft">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate">{snapshot.activity.summary}</p>
              {snapshot.activity.detail && (
                <p className="mt-1 leading-5 text-ink-faint">{snapshot.activity.detail}</p>
              )}
            </div>
          </div>
        )}
        {connectionError && !disconnected && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-negative/10 px-3 py-2 text-xs text-negative"
          >
            {connectionError}
          </p>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {snapshot.activity
            ? [snapshot.activity.summary, snapshot.activity.detail].filter(Boolean).join('. ')
            : ''}
        </span>
      </header>

      <div className={minimised ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        {disconnected && (
          <AiConnectionState
            pairing={connection.status === 'pairing' ? connection : null}
            busy={connectionBusy}
            error={
              connectionError ??
              (connection.status === 'disconnected' ? (connection.reason ?? null) : null)
            }
            local={local}
            hosted={hosted}
            onConnectAccess={(credential) => {
              if (!session.connectHosted) return;
              setConnectionBusy(true);
              setConnectionError(null);
              void session
                .connectHosted(credential)
                .then((result) => {
                  setConnectionBusy(false);
                  if (!result.ok) setConnectionError(result.error.message);
                })
                .catch(() => {
                  setConnectionBusy(false);
                  setConnectionError('Built-in AI is unavailable. Try again later.');
                });
            }}
            compact={!local && connection.status === 'disconnected' && snapshot.items.length > 0}
            onStartPairing={() => {
              setConnectionBusy(true);
              setConnectionError(null);
              void session.pair().then((result) => {
                setConnectionBusy(false);
                if (!result.ok) setConnectionError(result.error.message);
              });
            }}
            onCancel={resetConnection}
          />
        )}

        {(!disconnected || (connection.status === 'disconnected' && snapshot.items.length > 0)) && (
          <AiConversation items={snapshot.items} />
        )}

        {stoppableRun && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-2 text-xs text-ink-soft"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
              aria-hidden="true"
            />
            {stoppableRun.status === 'stop_requested' ? 'Stopping response' : 'AI is responding'}
          </div>
        )}

        {!disconnected && snapshot.approval && (
          <AiApprovalCard
            approval={snapshot.approval}
            session={session}
            autoFocus={pendingApproval}
          />
        )}

        <AiComposer
          session={session}
          disabled={disconnected}
          initialDraft={snapshot.draft}
          queuedFollowUp={snapshot.queuedFollowUp}
          autoFocus={!disconnected && !pendingApproval}
        />
      </div>
    </aside>
  );
}
