import { useRef, useState } from 'react';

/**
 * Interactive miniature of a Lacuna course path for the landing page.
 * Completing each node unlocks the next — the same rhythm as a real course.
 */

type NodeId = 'notes' | 'cards' | 'checkpoint';
type NodeStatus = 'completed' | 'available' | 'locked';

const NODES: Array<{ id: NodeId; label: string; detail: string }> = [
  { id: 'notes', label: 'Notes', detail: 'Read the lesson material' },
  { id: 'cards', label: 'Cards', detail: 'Study the new cards' },
  { id: 'checkpoint', label: 'Exam', detail: 'The fixed objective' },
];

function statusFor(id: NodeId, completed: Set<NodeId>): NodeStatus {
  const order: NodeId[] = ['notes', 'cards', 'checkpoint'];
  const i = order.indexOf(id);
  if (completed.has(id)) return 'completed';
  if (i === 0) return 'available';
  const prev = order[i - 1];
  return completed.has(prev) ? 'available' : 'locked';
}

export function PathDemo({ onComplete }: { onComplete?: () => void }) {
  const [completed, setCompleted] = useState<Set<NodeId>>(() => new Set());
  const finishedRef = useRef(false);
  const allDone = completed.has('checkpoint');

  function advance(id: NodeId) {
    if (statusFor(id, completed) !== 'available') return;
    setCompleted((prev) => new Set(prev).add(id));
    if (id === 'checkpoint' && !finishedRef.current) {
      finishedRef.current = true;
      onComplete?.();
    }
  }

  function reset() {
    setCompleted(new Set());
    finishedRef.current = false;
  }

  return (
    <div className="shadow-paper mt-6 overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          Try it — a course path
        </span>
        {allDone && (
          <button
            type="button"
            onClick={reset}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-opacity hover:opacity-70"
          >
            Reset
          </button>
        )}
      </div>

      <div className="px-6 py-8">
        <ol className="relative mx-auto flex max-w-md flex-col gap-0">
          {/* Spine */}
          <span
            aria-hidden
            className="absolute left-[1.375rem] top-4 bottom-4 w-px bg-line-strong"
          />
          <span
            aria-hidden
            className="absolute left-[1.375rem] top-4 w-0.5 origin-top bg-accent transition-all duration-700 ease-out"
            style={{
              height:
                completed.has('checkpoint')
                  ? 'calc(100% - 2rem)'
                  : completed.has('cards')
                    ? '50%'
                    : completed.has('notes')
                      ? '25%'
                      : '0%',
            }}
          />

          {NODES.map((node) => {
            const status = statusFor(node.id, completed);
            const locked = status === 'locked';
            const done = status === 'completed';
            const available = status === 'available';

            return (
              <li key={node.id} className="relative flex items-center gap-4 py-3 pl-0">
                <span
                  aria-hidden
                  className={
                    'relative z-10 grid size-11 shrink-0 place-items-center rounded-full border-2 transition-all duration-300 ' +
                    (done
                      ? 'border-accent bg-accent text-accent-fg shadow-[0_0_0_4px_hsl(var(--accent)/0.12)]'
                      : available
                        ? 'border-accent/70 bg-surface-raised text-accent shadow-[0_0_0_4px_hsl(var(--accent)/0.1)]'
                        : 'border-line bg-surface text-ink-faint')
                  }
                >
                  {done ? (
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : locked ? (
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="7" width="10" height="7" rx="1.5" />
                      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                    </svg>
                  ) : (
                    <span className="size-2.5 animate-pulse rounded-full bg-accent" />
                  )}
                </span>

                <div className={'min-w-0 flex-1 ' + (locked ? 'opacity-45' : '')}>
                  <p className="font-body text-sm font-semibold tracking-normal text-ink">{node.label}</p>
                  <p className="text-sm text-ink-soft">{node.detail}</p>
                </div>

                {available && (
                  <button
                    type="button"
                    onClick={() => advance(node.id)}
                    className="shadow-paper shadow-paper-hover shrink-0 rounded-[8px] border border-line-strong bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-accent hover:text-accent"
                  >
                    Complete
                  </button>
                )}
                {done && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    Done
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-center text-sm leading-relaxed text-ink-soft">
          {allDone
            ? 'Path complete — every course ends at a fixed exam date, just like this page.'
            : 'Complete each node to unlock the next. This page uses the same shape.'}
        </p>
      </div>
    </div>
  );
}
