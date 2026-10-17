import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { AiSession } from '../../ai/session/types';
import { inputFrameClassName } from '../ui/Field';
import { SparklesIcon } from '../ui/icons';
import { collapse } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';

const ACTIVITY_STATUS_LABEL = {
  working: 'Working',
  awaiting_approval: 'Approval needed',
  stop_requested: 'Stop requested',
  failed: 'Failed',
  completed: 'Complete',
} as const;

interface AiActivityCapsuleProps {
  session: AiSession;
  canOpenConversation: boolean;
  stoppableOnly?: boolean;
  onOpenConversation: () => void;
}

export function AiActivityCapsule(props: AiActivityCapsuleProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const capsuleRef = useRef<HTMLElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const snapshot = useSyncExternalStore(
    props.session.subscribe,
    props.session.getSnapshot,
    props.session.getSnapshot,
  );
  const stoppableRun =
    snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
      ? snapshot.run
      : null;
  const stopPending = stoppableRun?.status === 'stop_requested';
  const latestReply = [...snapshot.items].reverse().find((item) => item.kind === 'assistant');
  const statusLabel = snapshot.activity
    ? ACTIVITY_STATUS_LABEL[snapshot.activity.status]
    : stoppableRun?.status === 'stop_requested'
      ? 'Stop requested'
      : 'Working';
  const activitySummary = snapshot.activity?.summary ?? 'AI is responding';
  const compactSummary =
    activitySummary.trim().toLowerCase() === statusLabel.toLowerCase()
      ? (snapshot.activity?.detail ?? 'AI is responding')
      : activitySummary;

  useEffect(() => {
    if (!detailsOpen) return;

    const closeAndRestoreFocus = () => {
      setDetailsOpen(false);
      detailsTriggerRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAndRestoreFocus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (capsuleRef.current?.contains(event.target as Node)) return;
      closeAndRestoreFocus();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [detailsOpen]);

  async function sendFollowUp() {
    const content = followUp.trim();
    if (!content || sendingFollowUp || stopPending) return;
    setSendingFollowUp(true);
    setFollowUpError(null);
    try {
      const result = await props.session.send(content);
      if (result.ok) setFollowUp(content);
      else setFollowUpError(result.error.message);
    } catch {
      setFollowUpError('The follow-up could not be queued.');
    } finally {
      setSendingFollowUp(false);
    }
  }

  if ((!snapshot.activity && !stoppableRun) || (props.stoppableOnly && !stoppableRun)) return null;

  return (
    <section
      ref={capsuleRef}
      aria-label="AI activity"
      className="relative flex items-center gap-1 rounded-xl border border-line-strong bg-paper p-1.5 card-surface"
    >
      {props.canOpenConversation ? (
        <button
          ref={detailsTriggerRef}
          type="button"
          aria-label="View AI activity"
          aria-haspopup="dialog"
          aria-expanded={detailsOpen}
          onClick={() => {
            if (!detailsOpen) {
              setFollowUp(snapshot.queuedFollowUp ?? '');
              setFollowUpError(null);
            }
            setDetailsOpen(!detailsOpen);
          }}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface text-accent-ink">
            <SparklesIcon width={14} height={14} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-faint">
              {statusLabel}
            </span>
            <span className="block max-w-52 truncate text-sm text-ink">{compactSummary}</span>
          </span>
        </button>
      ) : (
        <p className="max-w-48 px-2">
          <span className="block text-sm font-medium text-ink-faint">
            {statusLabel}
          </span>
          <span className="block truncate text-sm text-ink">{compactSummary}</span>
        </p>
      )}
      {props.canOpenConversation && (
        <button
          type="button"
          onClick={props.onOpenConversation}
          className="min-h-11 rounded-full px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          Open
        </button>
      )}
      {stoppableRun && (
        <button
          type="button"
          disabled={stoppableRun.status === 'stop_requested'}
          onClick={() => void props.session.stop(stoppableRun.runId)}
          className="min-h-11 rounded-full bg-negative/10 px-3 text-sm font-medium text-negative transition-colors hover:bg-negative/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          {stoppableRun.status === 'stop_requested' ? 'Stop requested' : 'Stop'}
        </button>
      )}
      <AnimatePresence>
        {detailsOpen && props.canOpenConversation && (
          <motion.div
            role="dialog"
            aria-label="AI activity details"
            {...collapse(multiplier)}
            className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(22rem,calc(100vw-2rem))] rounded-3xl overflow-hidden bg-surface card-surface"
          >
          <div className="border-b border-line bg-surface px-4 py-3">
            <p className="text-sm font-medium text-ink-faint">
              Current activity
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {snapshot.activity?.summary ?? 'AI is responding'}
            </p>
            {snapshot.activity?.detail && (
              <p className="mt-1 text-xs leading-5 text-ink-soft">{snapshot.activity.detail}</p>
            )}
          </div>
          {latestReply && (
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-medium text-ink-faint">
                Latest reply
              </p>
              <p className="mt-1 line-clamp-4 text-sm leading-5 text-ink-soft">
                {latestReply.content}
              </p>
            </div>
          )}
          <div className="px-4 py-3">
            <label
              htmlFor="ai-capsule-follow-up"
              className="text-sm font-medium text-ink-faint"
            >
              Queued follow-up
            </label>
            <textarea
              id="ai-capsule-follow-up"
              rows={2}
              value={followUp}
              disabled={stopPending}
              placeholder={stopPending ? 'Waiting for AI to stop' : 'No follow-up queued'}
              onChange={(event) => setFollowUp(event.target.value)}
              className={cn(
                inputFrameClassName,
                'mt-2 block w-full min-h-16 resize-none text-sm placeholder:text-ink-faint',
              )}
            />
            {followUpError && (
              <p role="alert" className="mt-2 text-xs text-negative">
                {followUpError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-1 border-t border-line bg-surface px-3 py-2">
            <button
              type="button"
              disabled={stopPending || sendingFollowUp || followUp.trim().length === 0}
              onClick={() => void sendFollowUp()}
              className="min-h-11 rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sendingFollowUp
                ? 'Queuing'
                : snapshot.queuedFollowUp
                  ? 'Update follow-up'
                  : 'Queue follow-up'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDetailsOpen(false);
                props.onOpenConversation();
              }}
              className="min-h-11 rounded-full px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              Open conversation
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </section>
  );
}
