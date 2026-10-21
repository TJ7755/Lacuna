import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { animate, m as motion, useMotionValue, useTransform, type Transition } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { motionTransition } from '../../components/ui/motion';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Width of the fill held between the primary drop and its neighbour as they part. */
const BRIDGE_WIDTH = 96;

function rectOf(el: HTMLElement, offsetLeft = 0, offsetTop = 0): Rect {
  return {
    left: el.offsetLeft + offsetLeft,
    top: el.offsetTop + offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/** Keep the pill's round ends circular while its compositor layer changes width. */
function FlowDrop({
  target,
  base,
  question,
  pending,
  keeps,
  negative,
  spring,
  scaleTransition,
  m,
}: {
  target: Rect;
  base: Rect;
  question: boolean;
  pending: boolean;
  keeps: boolean;
  negative: boolean;
  spring: Transition;
  scaleTransition: Transition;
  m: number;
}) {
  const width = useMotionValue(target.width);
  const height = useMotionValue(target.height);
  const scaleX = useTransform(width, (value) => value / base.width);
  const scaleY = useTransform(height, (value) => value / base.height);
  const borderRadius = useTransform(
    () => `${(height.get() * base.width) / (2 * width.get())}px / ${base.height / 2}px`,
  );
  useLayoutEffect(() => {
    const horizontal = animate(width, target.width, spring);
    const vertical = animate(height, target.height, spring);
    return () => {
      horizontal.stop();
      vertical.stop();
    };
  }, [width, height, target.width, target.height, spring]);
  return (
    <motion.div
      className="absolute"
      style={{ width: base.width, height: base.height, scaleX, scaleY, originX: 0, originY: 0 }}
      initial={false}
      animate={{ x: target.left, y: target.top }}
      transition={spring}
    >
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          scaleY: question || pending ? [1, 0.9, 1] : keeps ? [1, 0.86, 1] : [1, 0.7, 0.45],
        }}
        transition={{ duration: 0.42 * m, times: [0, 0.35, 1], ease: 'easeOut' }}
      >
        <motion.div
          data-flow-drop={keeps ? 'primary' : 'drain'}
          className={
            'absolute inset-0 transition-[filter,background-color] duration-300 ' +
            (negative ? 'bg-negative' : 'bg-accent')
          }
          style={{ borderRadius }}
          initial={false}
          animate={{
            scale: pending && m > 0 ? [1, 1.14, 1] : question || pending || keeps ? 1 : 0,
          }}
          transition={scaleTransition}
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * A connecting accent fill behind the reveal and grade buttons. A blur and alpha-threshold
 * filter fuses drops wherever they touch, which draws the necks. Buttons keep their own
 * fill so their labels stay readable before measurement and throughout movement.
 */
function FlowGradeFill({
  question,
  pending,
  chosen,
  negative,
  reveal,
  slots,
  m,
}: {
  question: boolean;
  pending: boolean;
  chosen: number | undefined;
  negative: boolean;
  reveal: Rect;
  slots: Rect[];
  m: number;
}) {
  const filterId = `study-flow-${useId().replace(/[^\w-]/g, '')}`;
  const primaryIndex = chosen ?? slots.length - 1;
  const primary = slots[primaryIndex];
  // While an answer is being judged, the pill gathers into one bead at its centre.
  const bead = {
    left: reveal.left + reveal.width / 2 - reveal.height / 2,
    top: reveal.top,
    width: reveal.height,
    height: reveal.height,
  };
  const spring = useMemo<Transition>(
    () =>
      m === 0
        ? { duration: 0 }
        : question
          ? { type: 'spring', visualDuration: 0.42 * m, bounce: 0.32 }
          : { type: 'spring', visualDuration: 0.44 * m, bounce: 0.36 },
    [m, question],
  );
  const drain = useMemo<Transition>(
    () => (m === 0 ? { duration: 0 } : { type: 'spring', visualDuration: 0.26 * m, bounce: 0 }),
    [m],
  );
  // Outlined grades never hold fill: their share drains into the primary drop as the
  // pill splits, ending as a bead at its near end that it absorbs.
  const sink = {
    left: primary.left,
    top: primary.top,
    width: primary.height,
    height: primary.height,
  };

  // The drained fill only passes between the primary drop and its neighbour, so that is
  // the one neck. It rests inside the reveal pill, so it needs both on the pill's line.
  const neighbour = primaryIndex === slots.length - 1 ? slots[slots.length - 2] : undefined;
  const neighbourGap = neighbour && (neighbour.left + neighbour.width + primary.left) / 2;
  const bridge =
    !pending &&
    neighbour &&
    neighbourGap !== undefined &&
    neighbour.top === primary.top &&
    primary.top === reveal.top &&
    neighbourGap - BRIDGE_WIDTH / 2 >= reveal.left &&
    neighbourGap + BRIDGE_WIDTH / 2 <= reveal.left + reveal.width
      ? neighbourGap
      : undefined;

  return (
    <>
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id={filterId} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="fused-fill"
          />
          <feComposite in="SourceGraphic" in2="fused-fill" operator="atop" />
        </filter>
      </svg>
      <div
        aria-hidden
        data-flow-layer
        className="pointer-events-none absolute inset-0"
        style={{ filter: `url(#${filterId})` }}
      >
        {slots.map((slot, index) => {
          const keeps = index === primaryIndex;
          const target = question ? reveal : pending ? bead : keeps ? slot : sink;
          const whole = question || pending || keeps;
          return (
            <FlowDrop
              key={index}
              target={target}
              base={reveal}
              question={question}
              pending={pending}
              keeps={keeps}
              negative={negative}
              spring={whole ? spring : drain}
              m={m}
              scaleTransition={
                pending && m > 0
                  ? { duration: 1.1 * m, repeat: Infinity, ease: 'easeInOut' }
                  : question || pending
                    ? { duration: 0.08 * m }
                    : keeps
                      ? { duration: 0.18 * m }
                      : { duration: 0.12 * m, delay: 0.2 * m, ease: 'easeIn' }
              }
            />
          );
        })}
        {bridge !== undefined && (
          // Holds the neck between the primary drop and the fill draining into it, thins,
          // then snaps; on the way back it fills in so the drops fuse.
          <motion.div
            className="absolute rounded-full bg-accent"
            style={{
              left: bridge - BRIDGE_WIDTH / 2,
              top: primary.top,
              width: BRIDGE_WIDTH,
              height: primary.height,
            }}
            initial={false}
            animate={
              question
                ? { scaleY: 1, scaleX: 1 }
                : { scaleY: [1, 0.85, 0.3, 0], scaleX: [1, 1.15, 0.7, 0.4] }
            }
            transition={
              question
                ? { duration: 0.22 * m, delay: 0.06 * m, ease: 'easeOut' }
                : { duration: 0.42 * m, times: [0, 0.3, 0.75, 1], ease: 'easeIn' }
            }
          />
        )}
      </div>
    </>
  );
}

/**
 * Show answer, then the grade buttons, as one continuous fill. On reveal the pill pinches
 * into the primary (last) grade, which springs into its slot and wobbles as it settles,
 * while outlined grades appear as empty shells where the fill has drained away. On the
 * next card the fill flows back out and merges into the pill. `grades` are rendered
 * with their primary grade last.
 */
export function FlowGradeControls({
  question,
  pending = false,
  chosen,
  chosenNegative = false,
  grades,
  rowClassName,
  revealLabel = 'Show answer',
  revealLead,
  onReveal,
  m,
}: {
  question: boolean;
  /** An answer is being judged: the fill waits as a bead and no grade is offered yet. */
  pending?: boolean;
  /** The grade a judgement chose: all the fill flows into it instead of the primary. */
  chosen?: number;
  /** Whether the chosen grade is a negative one, which the fill takes the colour of. */
  chosenNegative?: boolean;
  grades: ReactNode[];
  rowClassName: string;
  revealLabel?: ReactNode;
  /** Content above the reveal pill that fades with it, such as a typed answer field. */
  revealLead?: ReactNode;
  onReveal: () => void;
  m: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [rects, setRects] = useState<{ reveal: Rect; slots: Rect[] }>();
  const measured = rects !== undefined;

  useLayoutEffect(() => {
    const measure = () => {
      const reveal = revealRef.current;
      const pill = pillRef.current;
      const row = rowRef.current;
      if (!reveal || !pill || !row) return;
      setRects({
        reveal: rectOf(pill, reveal.offsetLeft, reveal.offsetTop),
        slots: slotRefs.current
          .slice(0, grades.length)
          .map((slot) =>
            slot
              ? rectOf(slot, row.offsetLeft, row.offsetTop)
              : rectOf(pill, reveal.offsetLeft, reveal.offsetTop),
          ),
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [grades.length]);

  const centre = (grades.length - 1) / 2;
  return (
    <div
      ref={box}
      // Keep the connecting fill in step with button hover feedback.
      className={
        'relative mx-auto grid w-full ' +
        '[&:has([data-flow-reveal]_button:hover)_[data-flow-drop]]:brightness-105 ' +
        '[&:has([data-flow-primary]_button:hover)_[data-flow-drop=primary]]:brightness-105'
      }
    >
      {rects && (
        <FlowGradeFill
          question={question}
          pending={pending && !question}
          chosen={question ? undefined : chosen}
          negative={!question && chosen !== undefined && chosenNegative}
          reveal={rects.reveal}
          slots={rects.slots}
          m={m}
        />
      )}
      <motion.div
        ref={revealRef}
        data-flow-reveal
        className="relative col-start-1 row-start-1 mx-auto w-full max-w-md self-start"
        initial={false}
        animate={{ opacity: question ? 1 : 0 }}
        transition={question ? motionTransition('feedback', m) : { duration: 0.08 * m }}
        inert={!question}
        aria-hidden={!question}
      >
        {revealLead}
        <div ref={pillRef}>
          <Button variant="primary" size="lg" className="w-full" onClick={onReveal}>
            {revealLabel}
          </Button>
        </div>
      </motion.div>
      <div
        ref={rowRef}
        className={`relative col-start-1 row-start-1 mx-auto self-start ${rowClassName}`}
        inert={question || pending}
        aria-hidden={question || pending}
      >
        {grades.map((grade, index) => {
          const holder = index === (chosen ?? grades.length - 1);
          const primary = index === grades.length - 1;
          return (
            <motion.div
              key={index}
              ref={(el) => {
                slotRefs.current[index] = el;
              }}
              data-flow-primary={holder || undefined}
              className={
                'flex min-w-0 flex-1' +
                // A judged negative grade holds the fill, so its label sits on the fill.
                (measured && holder && !primary
                  ? ` [&_button]:border-transparent! ${chosenNegative ? '[&_button]:bg-negative! [&_button]:text-paper!' : '[&_button]:bg-accent! [&_button]:text-accent-fg!'}`
                  : '') +
                // The primary drained elsewhere: it stays as an empty shell.
                (measured && primary && !holder
                  ? ' [&_button]:bg-transparent! [&_button]:text-ink! [&_button]:ring-1 [&_button]:ring-inset [&_button]:ring-line-strong'
                  : '')
              }
              initial={false}
              animate={{
                opacity: question || pending ? 0 : 1,
                // Outlined grades split away from the centre as the fill leaves them.
                x: question && !primary ? `${(centre - index) * 6}%` : '0%',
              }}
              transition={
                question
                  ? { duration: 0.08 * m }
                  : {
                      x:
                        m === 0
                          ? { duration: 0 }
                          : { type: 'spring', visualDuration: 0.44 * m, bounce: 0.36 },
                      // Labels respond immediately; the fill can settle around them.
                      opacity: motionTransition('feedback', m),
                    }
              }
            >
              {grade}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
