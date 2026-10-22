import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { animate, m as motion, useMotionValue, useTransform, type Transition } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { MOTION_EASING, motionTransition } from '../../components/ui/motion';
import type { AutoMark } from './types';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectOf(el: HTMLElement, offsetLeft = 0, offsetTop = 0): Rect {
  return {
    left: el.offsetLeft + offsetLeft,
    top: el.offsetTop + offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

interface FlowControlsProps {
  question: boolean;
  /**
   * Automatic marking owns the revealed answer: the liquid waits as a bead and the
   * self-marking grades never split off, taking the verdict's colour once it lands.
   */
  autoMark?: AutoMark;
  grades: ReactNode[];
  rowClassName: string;
  revealLabel?: ReactNode;
  /** Content above the reveal pill that fades with it, such as a typed answer field. */
  revealLead?: ReactNode;
  onReveal: () => void;
  m: number;
}

const centreX = (rect: Rect) => rect.left + rect.width / 2;
const centreY = (rect: Rect) => rect.top + rect.height / 2;

/** How long, before motion scaling, the liquid draws the split before the buttons' own chrome returns. */
const SPLIT_SETTLE = 0.6;
/** How long, in seconds, button transitions stay off after their chrome returns. */
const HANDBACK = 0.2;
/** How far drops overshoot their slots as they split, and the pill as they gather. */
const SPLIT_BOUNCE = 0.5;
const GATHER_BOUNCE = 0.42;

/**
 * The pill cut into one segment per grade. Inner ends reach half the height into their
 * neighbours, so together the segments draw exactly the pill until they part.
 */
function pillSegments(pill: Rect, count: number): Rect[] {
  const share = pill.width / count;
  return Array.from({ length: count }, (_, index) => {
    const left = Math.max(pill.left, pill.left + share * index - pill.height / 2);
    const right = Math.min(
      pill.left + pill.width,
      pill.left + share * (index + 1) + pill.height / 2,
    );
    return { left, top: pill.top, width: right - left, height: pill.height };
  });
}

/** A rect grown by the colour's margin over the surface it is clipped to. */
function swell(rect: Rect, across = 16, down = 16): Rect {
  return {
    left: rect.left - across,
    top: rect.top - down,
    width: rect.width + across * 2,
    height: rect.height + down * 2,
  };
}

/** A pill whose geometry springs between rects, about its centre so it grows evenly. */
function FlowShape({ id, to, transition }: { id?: string; to: Rect; transition: Transition }) {
  const cx = useMotionValue(centreX(to));
  const cy = useMotionValue(centreY(to));
  const width = useMotionValue(to.width);
  const height = useMotionValue(to.height);
  const x = useTransform(() => cx.get() - width.get() / 2);
  const y = useTransform(() => cy.get() - height.get() / 2);
  const radius = useTransform(height, (value) => value / 2);
  const { left, top, width: w, height: h } = to;
  useLayoutEffect(() => {
    const running = (
      [
        [cx, left + w / 2],
        [cy, top + h / 2],
        [width, w],
        [height, h],
      ] as const
    ).map(([value, target]) => animate(value, target, transition));
    return () => running.forEach((controls) => controls.stop());
  }, [cx, cy, width, height, left, top, w, h, transition]);
  return <motion.rect id={id} x={x} y={y} width={width} height={height} rx={radius} />;
}

/**
 * The liquid that draws the pill splitting into its grades. Each grade has a surface drop,
 * which springs from its segment of the pill to its slot, and a colour drop, which pours
 * into the holder unless it is the holder. A blur and alpha threshold fuses near
 * drops of each kind, so the surface drops stay joined by necks that thin and snap as they
 * part, and the colour flows along them into the holder.
 */
function FlowSplitLiquid({
  question,
  waiting,
  neutral,
  holder,
  negative,
  reveal,
  slots,
  visible,
  m,
}: {
  question: boolean;
  /** The drops stay gathered on one waiting bead instead of splitting into the grades. */
  waiting: boolean;
  /** No verdict has arrived yet: keep the waiting liquid neutral. */
  neutral: boolean;
  holder: number;
  negative: boolean;
  reveal: Rect;
  slots: Rect[];
  visible: boolean;
  m: number;
}) {
  const id = `study-flow-${useId().replace(/[^\w-]/g, '')}`;
  const bead = {
    left: centreX(reveal) - reveal.height / 2,
    top: reveal.top,
    width: reveal.height,
    height: reveal.height,
  };
  const segments = pillSegments(reveal, slots.length);
  const target = slots[holder];
  // Colour enters the holder at its end nearest the drop it comes from.
  const sinkFor = (index: number) => ({
    left: index > holder ? target.left + target.width - target.height : target.left,
    top: target.top,
    width: target.height,
    height: target.height,
  });
  const spring = useMemo<Transition>(
    () =>
      m === 0
        ? { duration: 0 }
        : question
          ? { type: 'spring', visualDuration: 0.36 * m, bounce: GATHER_BOUNCE }
          : { type: 'spring', visualDuration: 0.37 * m, bounce: SPLIT_BOUNCE },
    [m, question],
  );
  const drain = useMemo<Transition>(
    () => (m === 0 ? { duration: 0 } : { type: 'spring', visualDuration: 0.22 * m, bounce: 0 }),
    [m],
  );

  const liquid = (name: string, edge: ReactNode) => (
    <filter
      id={`${id}-${name}`}
      filterUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11"
        result="liquid"
      />
      {edge}
    </filter>
  );
  const centred = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
  const shells = slots.map((_, index) => <use key={index} href={`#${id}-shell-${index}`} />);
  const pulsing = waiting && m > 0;
  const colour = neutral
    ? 'hsl(from var(--color-ink-faint) h 0% l)'
    : negative
      ? 'var(--color-negative)'
      : waiting
        ? 'var(--color-positive)'
        : 'var(--color-accent)';

  return (
    <svg
      aria-hidden
      data-flow-layer
      className={
        // The buttons' own chrome takes over at once, so the liquid leaves at once too.
        'pointer-events-none absolute inset-0 h-full w-full overflow-visible' +
        (visible ? '' : ' invisible')
      }
    >
      <defs>
        {slots.map((slot, index) => (
          <motion.g
            key={index}
            id={`${id}-shell-${index}`}
            style={centred}
            initial={false}
            animate={
              pulsing
                ? {
                    x: [0, index % 2 === 0 ? -12 : 12, 0, index % 2 === 0 ? 8 : -8, 0],
                    y: [0, index % 2 === 0 ? 5 : -5, 0, index % 2 === 0 ? -7 : 7, 0],
                    scaleX: index % 2 === 0 ? [1, 0.78, 1.12, 0.9, 1] : [1, 1.12, 0.86, 1.06, 1],
                    scaleY: index % 2 === 0 ? [1, 1.18, 0.9, 1.12, 1] : [1, 0.9, 1.12, 0.94, 1],
                  }
                : { x: 0, y: 0, scaleX: 1, scaleY: 1 }
            }
            transition={
              pulsing
                ? { duration: 1.6 * m, repeat: Infinity, ease: 'easeInOut' }
                : spring
            }
          >
            <FlowShape
              to={question ? segments[index] : waiting ? bead : slot}
              transition={spring}
            />
          </motion.g>
        ))}
        {liquid('body', null)}
        {/* The colour only ever shows within the joined surface drops. */}
        <mask
          id={`${id}-within`}
          maskUnits="userSpaceOnUse"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <g filter={`url(#${id}-body)`} fill="white">
            {shells}
          </g>
        </mask>
        {liquid(
          'shell',
          <>
            {/* A fine outline traced around the joined drops. */}
            <feMorphology in="liquid" operator="erode" radius="1" result="inner" />
            <feComposite in="liquid" in2="inner" operator="out" result="ring" />
            <feFlood style={{ floodColor: 'var(--color-line-strong)' }} result="line" />
            <feComposite in="line" in2="ring" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="liquid" />
              <feMergeNode in="outline" />
            </feMerge>
          </>,
        )}
        {liquid(
          'colour',
          <>
            {/* A soft highlight along the top edge, as light catching a curved surface. */}
            <feOffset in="liquid" dy="1.5" result="lowered" />
            <feComposite in="liquid" in2="lowered" operator="out" result="rim" />
            <feFlood floodColor="white" floodOpacity="0.45" result="light" />
            <feComposite in="light" in2="rim" operator="in" result="highlight" />
            <feMerge>
              <feMergeNode in="liquid" />
              <feMergeNode in="highlight" />
            </feMerge>
          </>,
        )}
      </defs>
      <motion.g
        style={centred}
        initial={false}
        animate={{ scale: pulsing ? [1, 1.08, 1] : 1 }}
        transition={
          pulsing
            ? { duration: 1.6 * m, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.08 * m }
        }
      >
        <g filter={`url(#${id}-shell)`} style={{ fill: 'var(--color-surface-raised)' }}>
          {shells}
        </g>
        <g
          data-flow-colour
          mask={`url(#${id}-within)`}
          filter={`url(#${id}-colour)`}
          style={{
            fill: colour,
            transition: neutral
              ? 'none'
              : `fill ${0.3 * m}s cubic-bezier(${MOTION_EASING.standard.join(',')})`,
          }}
        >
          {slots.map((slot, index) => {
            const keeps = index === holder;
            const whole = question || waiting || keeps;
            return (
              // Each colour drop squashes as it springs, rebounding; those that drain thin as they pour.
              <motion.g
                key={index}
                style={centred}
                initial={false}
                animate={{
                  scaleY:
                    m === 0
                      ? 1
                      : question || waiting
                        ? [1, 0.9, 1.03, 1]
                        : keeps
                          ? [1, 0.82, 1.05, 1]
                          : [1, 0.7, 0.55, 0.45],
                }}
                transition={{ duration: 0.42 * m, times: [0, 0.3, 0.65, 1], ease: 'easeOut' }}
              >
                <motion.g
                  style={centred}
                  initial={false}
                  animate={{ scale: whole ? 1 : 0 }}
                  transition={
                    question || waiting
                      ? { duration: 0.08 * m }
                      : keeps
                        ? { duration: 0.15 * m }
                        : { duration: 0.1 * m, delay: 0.17 * m, ease: 'easeIn' }
                  }
                >
                  <FlowShape
                    to={
                      // Colour that stays overfills the surface it is clipped to, so the
                      // surface's outline and rebound never show past it.
                      question
                        ? swell(segments[index])
                        : waiting
                          ? swell(bead)
                          : keeps
                            ? // Enough to cover its squash, not to reach a neighbour.
                              swell(slot, 3)
                            : sinkFor(index)
                    }
                    transition={whole ? spring : drain}
                  />
                </motion.g>
              </motion.g>
            );
          })}
        </g>
      </motion.g>
    </svg>
  );
}

/**
 * Show answer, then the grade buttons, as one liquid. On reveal the pill splits
 * into a drop per grade, joined by necks, and the colour of every other drop drains into
 * the primary (last) grade while they are still connected; the necks then thin and snap,
 * leaving outlined grades. On the next card the drops flow back together and the colour
 * returns. While the liquid moves, the buttons show only their labels, riding on their
 * drops, and are already usable; their own fills and outlines return once it settles.
 * While automatic marking owns a submitted answer the pill gathers into a waiting bead
 * instead: the grades never split off, and the verdict colours the bead.
 * `grades` are rendered with their primary grade last.
 */
export function FlowGradeControls({
  question,
  autoMark,
  grades,
  rowClassName,
  revealLabel = 'Show answer',
  revealLead,
  onReveal,
  m,
}: FlowControlsProps) {
  const box = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [rects, setRects] = useState<{ reveal: Rect; slots: Rect[] }>();
  const measured = rects !== undefined;
  const judging = autoMark?.pending === true && !question;
  const automatic = autoMark !== undefined && !question;
  const gathered = question || automatic;

  // The liquid takes over whenever the controls change shape between the pill, the
  // waiting bead and the split grades.
  const shape = question ? 'pill' : automatic ? 'bead' : 'split';
  const [wasShape, setWasShape] = useState(shape);
  const [flow, setFlow] = useState({ started: 0, settled: 0, restored: 0 });
  if (wasShape !== shape) {
    setWasShape(shape);
    if (m > 0) setFlow((current) => ({ ...current, started: current.started + 1 }));
  }
  useEffect(() => {
    if (flow.started === flow.settled) return;
    const timer = window.setTimeout(
      () => setFlow((current) => ({ ...current, settled: flow.started })),
      SPLIT_SETTLE * m * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [flow.started, flow.settled, m]);
  // The buttons' chrome returns at once beneath the fading liquid, then their own colour
  // transitions resume.
  useEffect(() => {
    if (flow.settled !== flow.started || flow.restored === flow.started) return;
    const timer = window.setTimeout(
      () => setFlow((current) => ({ ...current, restored: flow.settled })),
      HANDBACK * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [flow.started, flow.settled, flow.restored]);
  const flowing = measured && (flow.started !== flow.settled || automatic);
  const still = measured && (flowing || flow.started !== flow.restored);

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

  // Where each grade's label rides from: its segment of the pill, or the waiting bead.
  const origins = rects
    ? automatic
      ? rects.slots.map(() => ({ x: centreX(rects.reveal), y: centreY(rects.reveal) }))
      : pillSegments(rects.reveal, grades.length).map((segment) => ({
          x: centreX(segment),
          y: centreY(segment),
        }))
    : undefined;
  const spring = useMemo<Transition>(
    () =>
      m === 0
        ? { duration: 0 }
        : { type: 'spring', visualDuration: 0.37 * m, bounce: SPLIT_BOUNCE },
    [m],
  );
  // While the liquid draws the controls, the buttons keep only their labels. Their chrome
  // leaves and returns at once rather than fading over the liquid.
  const chrome =
    (flowing
      ? ' [&_button]:bg-transparent! [&_button]:border-transparent! [&_button]:ring-0!'
      : '') + (still ? ' [&_button]:transition-none!' : '');

  return (
    <div ref={box} className="relative mx-auto grid w-full">
      {rects && (
        <FlowSplitLiquid
          question={question}
          waiting={automatic}
          neutral={judging}
          holder={grades.length - 1}
          negative={!question && autoMark !== undefined && !autoMark.pending && !autoMark.correct}
          reveal={rects.reveal}
          slots={rects.slots}
          visible={flowing}
          m={m}
        />
      )}
      <motion.div
        ref={revealRef}
        data-flow-reveal
        className={'relative col-start-1 row-start-1 mx-auto w-full max-w-md self-start' + chrome}
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
        inert={gathered}
        aria-hidden={gathered}
      >
        {grades.map((grade, index) => {
          const primary = index === grades.length - 1;
          const slot = rects?.slots[index];
          const origin = origins?.[index];
          const offset =
            gathered && slot && origin
              ? { x: origin.x - centreX(slot), y: origin.y - centreY(slot) }
              : { x: 0, y: 0 };
          return (
            <motion.div
              key={index}
              ref={(el) => {
                slotRefs.current[index] = el;
              }}
              data-flow-primary={primary || undefined}
              className={'flex min-w-0 flex-1' + chrome}
              initial={false}
              animate={{ opacity: gathered ? 0 : 1, x: offset.x, y: offset.y }}
              transition={{
                x: spring,
                y: spring,
                // Labels respond immediately; the liquid can settle around them.
                opacity: gathered ? { duration: 0.08 * m } : motionTransition('feedback', m),
              }}
            >
              {grade}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
