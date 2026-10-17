import { useLayoutEffect, useRef, useState } from 'react';
import { animate, m as motion, useMotionValue } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import { countOf } from '../../utils/plural';
import type { SessionCardOutcome } from './types';
import { SESSION_SEGMENT_GAP, sessionSegmentWindow } from './sessionSegmentWindow';

export function SessionSegments({
  cardIds,
  outcomes,
  currentCardIds,
  value,
  label,
  m,
}: {
  cardIds: string[];
  outcomes: Map<string, SessionCardOutcome>;
  currentCardIds: readonly string[];
  value: number;
  label: string;
  m: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const previousWidth = useRef(0);
  const x = useMotionValue(0);
  const currentIndex = currentCardIds.length === 0 ? -1 : cardIds.indexOf(currentCardIds[0]);
  const progressAnnouncement =
    currentIndex >= 0 ? `Card ${currentIndex + 1} of ${cardIds.length}` : 'Session complete';
  const { size, start, segmentWidth } = sessionSegmentWindow(
    cardIds.length,
    currentCardIds.length === 0 ? cardIds.length - 1 : currentIndex,
    width,
  );
  const windowed = size < cardIds.length;
  const offset = -start * (segmentWidth + SESSION_SEGMENT_GAP);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (width === 0) return;
    // Resizing changes the geometry, not the learner's position. Snap that change
    // before paint; only navigation glides, using the row's presented position.
    if (previousWidth.current !== width || m === 0) {
      x.jump(offset);
      previousWidth.current = width;
      return;
    }
    const animation = animate(x, offset, scaledSpring(m, 420, 2 * Math.sqrt(420)));
    return () => animation.stop();
  }, [m, offset, width, x]);

  const fadeLeft = start > 0 ? 'transparent, black 12px' : 'black';
  const fadeRight =
    start + size < cardIds.length ? 'black calc(100% - 12px), transparent' : 'black';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}
      title={`${countOf(cardIds.length, 'card')} in this session`}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {progressAnnouncement}
      </span>
      <div
        ref={viewport}
        className="h-2 w-full overflow-hidden"
        aria-hidden="true"
        style={{
          maskImage: windowed ? `linear-gradient(to right, ${fadeLeft}, ${fadeRight})` : undefined,
        }}
      >
        <motion.div
          data-session-segment-row=""
          className="relative flex h-full gap-1"
          style={{
            x,
            width: windowed
              ? cardIds.length * (segmentWidth + SESSION_SEGMENT_GAP) - SESSION_SEGMENT_GAP
              : '100%',
          }}
        >
          {cardIds.map((id) => {
            const current = currentCardIds.includes(id);
            const status = outcomes.get(id) ?? (current ? 'current' : 'unseen');
            return (
              <span
                key={id}
                data-session-card-status={status}
                className={cn(
                  'relative min-w-px overflow-hidden rounded-full border',
                  windowed ? 'shrink-0' : 'flex-1',
                  current
                    ? 'border-accent'
                    : status === 'correct'
                      ? 'border-positive'
                      : status === 'wrong'
                        ? 'border-negative'
                        : 'border-transparent',
                  status === 'current' && 'bg-accent/10',
                  status === 'unseen' && 'bg-ink/10',
                )}
                style={{ width: windowed ? segmentWidth : undefined }}
              >
                <motion.span
                  className={cn(
                    'absolute inset-0 origin-left rounded-full',
                    status === 'wrong' ? 'bg-negative' : 'bg-positive',
                  )}
                  initial={false}
                  animate={{ scaleX: status === 'correct' || status === 'wrong' ? 1 : 0 }}
                  transition={scaledSpring(m, 300, 2 * Math.sqrt(300))}
                />
              </span>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
