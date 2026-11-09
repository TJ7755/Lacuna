import { memo, useLayoutEffect, useRef, useState } from 'react';
import { m as motion, useAnimationControls } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import { countOf } from '../../utils/plural';
import type { SessionCardOutcome } from './types';
import { sessionSegmentWindow } from './sessionSegmentWindow';

export function SessionSegments({
  cardIds,
  outcomes,
  currentCardIds,
  value,
  label,
  m,
  noun = 'Card',
}: {
  cardIds: string[];
  outcomes: Map<string, SessionCardOutcome>;
  currentCardIds: readonly string[];
  value: number;
  label: string;
  m: number;
  /** What each segment stands for, in the spoken position. */
  noun?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const previousWidth = useRef(0);
  const snapped = useRef(true);
  const position = useAnimationControls();
  const currentIndex = currentCardIds.length === 0 ? -1 : cardIds.indexOf(currentCardIds[0]);
  const progressAnnouncement =
    currentIndex >= 0 ? `${noun} ${currentIndex + 1} of ${cardIds.length}` : 'Session complete';
  const { size, start, segmentWidth, gap } = sessionSegmentWindow(
    cardIds.length,
    currentCardIds.length === 0 ? cardIds.length - 1 : currentIndex,
    width,
  );
  const windowed = size < cardIds.length;
  const offset = -start * (segmentWidth + gap);

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
      position.set({ x: offset });
      previousWidth.current = width;
      snapped.current = true;
      return;
    }
    // Named element transforms can run on the compositor. Controls retain the
    // presented position and velocity when navigation interrupts this same spring.
    void position.start({
      x: offset,
      transition: {
        ...scaledSpring(m, 420, 2 * Math.sqrt(420)),
        ...(snapped.current ? { velocity: 0 } : {}),
      },
    });
    snapped.current = false;
    return () => position.stop();
  }, [m, offset, width, position]);

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
      title={`${countOf(cardIds.length, noun.toLowerCase())} in this session`}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {progressAnnouncement}
      </span>
      <div
        ref={viewport}
        className={cn('w-full overflow-hidden', gap === 6 ? 'h-2.5' : 'h-2')}
        aria-hidden="true"
        style={{
          maskImage: windowed ? `linear-gradient(to right, ${fadeLeft}, ${fadeRight})` : undefined,
        }}
      >
        <motion.div
          data-session-segment-row=""
          className="relative flex h-full"
          animate={position}
          style={{
            // Initialise element-owned motion before the first geometry snap.
            x: 0,
            gap,
            width: windowed ? cardIds.length * (segmentWidth + gap) - gap : '100%',
          }}
        >
          {cardIds.map((id) => {
            const current = currentCardIds.includes(id);
            return (
              <SessionSegment
                key={id}
                current={current}
                status={outcomes.get(id) ?? (current ? 'current' : 'unseen')}
                width={windowed ? segmentWidth : undefined}
                m={m}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

// Keep every segment available to the sliding row, while only updating pips
// whose appearance or geometry has changed.
const SessionSegment = memo(function SessionSegment({
  current,
  status,
  width,
  m,
}: {
  current: boolean;
  status: SessionCardOutcome | 'current' | 'unseen';
  width?: number;
  m: number;
}) {
  return (
    <span
      data-session-card-status={status}
      className={cn(
        'relative min-w-px overflow-hidden rounded-full border',
        width === undefined ? 'flex-1' : 'shrink-0',
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
      style={{ width }}
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
});
