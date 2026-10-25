import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AnimatePresence, LayoutGroup, m as motion } from 'motion/react';
import { cn } from './cn';
import { expandingActionSpring, scaledSpring } from './motion';
import { ChevronDownIcon } from './icons';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: string;
  /** Accessible name when the visible label is only an icon or a glyph. */
  ariaLabel?: string;
}

/**
 * Pill track with a white pill that slides (and springs) to the chosen option.
 * Only selection changes move the indicator; text-size reflow stays immediate.
 * A single radiogroup with roving focus: arrows, Home and End move the choice.
 */
export function SegmentedPills<T extends string>({
  label,
  value,
  options,
  onChange,
  describedBy,
  className,
  animateSelection = true,
  animateLayout = false,
  semantics = 'radio',
  size = 'md',
  onMore,
  moreLabel,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  describedBy?: string;
  className?: string;
  /** Text-size changes reflow immediately, including their selection indicator. */
  animateSelection?: boolean;
  /** Reflow dynamic options while their labels keep their natural size. */
  animateLayout?: boolean;
  semantics?: 'radio' | 'pressed';
  size?: 'sm' | 'md';
  onMore?: () => void;
  moreLabel?: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const groupId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.findIndex((option) => option.value === value);
  const track = useRef<HTMLDivElement>(null);
  const stacked = useStackWhenCramped(track, buttons, options.length + Number(Boolean(onMore)));

  function choose(index: number) {
    onChange(options[index].value);
    buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = options.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    choose(next);
  }

  const reveal = {
    initial: multiplier > 0 ? { opacity: 0, scale: 0.94 } : (false as const),
    animate: { opacity: 1, scale: 1 },
    exit: multiplier > 0 ? { opacity: 0, scale: 0.94 } : undefined,
    transition: scaledSpring(multiplier, 380, 34),
  };
  const pillClass = cn(
    !animateSelection && 'scale-100!',
    'relative inline-flex min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink',
    size === 'md' ? 'min-h-11 px-4' : 'min-h-11 px-3.5',
  );

  return (
    <div
      role={semantics === 'radio' ? 'radiogroup' : 'group'}
      aria-label={label}
      aria-describedby={describedBy}
      ref={track}
      data-stacked={stacked || undefined}
      className={cn(
        'max-w-full px-1',
        animateLayout ? 'relative' : 'bg-ink/[0.06]',
        stacked ? 'flex w-full flex-col rounded-[1.375rem]' : 'inline-flex rounded-full',
        className,
      )}
    >
      <LayoutGroup id={groupId}>
        {animateLayout && (
          <motion.div
            key="track"
            layout={multiplier > 0}
            aria-hidden="true"
            transition={expandingActionSpring(multiplier)}
            style={{ borderRadius: stacked ? 22 : 9999 }}
            className="pointer-events-none absolute inset-0 bg-ink/[0.06]"
          />
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {options.map((option, index) => {
            const active = index === selected;
            return (
              <motion.button
                {...reveal}
                layout={animateLayout && multiplier > 0 ? 'position' : false}
                key={option.value}
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                type="button"
                style={{ transitionDuration: `${150 * multiplier}ms` }}
                data-press={animateSelection ? undefined : ''}
                role={semantics === 'radio' ? 'radio' : undefined}
                aria-checked={semantics === 'radio' ? active : undefined}
                aria-pressed={semantics === 'pressed' ? active : undefined}
                aria-label={option.ariaLabel}
                aria-description={option.description}
                title={option.description}
                tabIndex={semantics === 'radio' ? (active ? 0 : -1) : undefined}
                onClick={() => onChange(option.value)}
                onKeyDown={semantics === 'radio' ? (event) => onKeyDown(event, index) : undefined}
                className={cn(pillClass, active ? 'text-ink' : 'text-ink-soft hover:text-ink')}
              >
                {active && (
                  <motion.span
                    key="indicator"
                    layoutId={animateSelection && multiplier > 0 ? 'segmented-pill' : undefined}
                    layoutDependency={value}
                    aria-hidden="true"
                    transition={scaledSpring(multiplier, 520, 36)}
                    className="absolute inset-x-0 inset-y-1 rounded-full bg-surface shadow-[0_1px_3px_hsl(var(--ink)/0.14)]"
                  />
                )}
                <span key="label" data-pill-label className="relative">
                  {option.label}
                </span>
              </motion.button>
            );
          })}
          {onMore && (
            <motion.button
              {...reveal}
              layout={animateLayout && multiplier > 0 ? 'position' : false}
              key="segmented-more"
              ref={(node) => {
                buttons.current[options.length] = node;
              }}
              type="button"
              aria-label={moreLabel}
              aria-expanded={false}
              onClick={onMore}
              className={cn(pillClass, 'gap-1 text-ink-soft hover:text-ink')}
            >
              <span data-pill-label>More</span>
              <ChevronDownIcon width={14} height={14} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

/**
 * True when the options cannot sit side by side in the space beside or beneath
 * their label, so the track stacks them vertically instead of overflowing its
 * card. Measured from the labels, so it follows the text-size setting too.
 */
function useStackWhenCramped(
  track: RefObject<HTMLDivElement | null>,
  buttons: RefObject<Array<HTMLButtonElement | null>>,
  optionCount: number,
): boolean {
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const element = track.current;
    const parent = element?.parentElement;
    if (!element || !parent || typeof ResizeObserver === 'undefined') return;
    const px = (value: string) => parseFloat(value) || 0;

    const measure = () => {
      const trackStyle = getComputedStyle(element);
      let needed = px(trackStyle.paddingLeft) + px(trackStyle.paddingRight);
      for (const button of buttons.current.slice(0, optionCount)) {
        const label = button?.querySelector('[data-pill-label]');
        if (!button || !label) continue;
        const style = getComputedStyle(button);
        const content =
          label.getBoundingClientRect().width +
          px(style.paddingLeft) +
          px(style.paddingRight) +
          (button === buttons.current[optionCount - 1] && button.hasAttribute('aria-expanded')
            ? 18
            : 0);
        needed += Math.max(px(style.minWidth), content);
      }
      const parentStyle = getComputedStyle(parent);
      const available =
        parent.clientWidth - px(parentStyle.paddingLeft) - px(parentStyle.paddingRight);
      setStacked(needed > available + 0.5);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    for (const button of buttons.current.slice(0, optionCount)) {
      if (button?.querySelector('[data-pill-label]'))
        observer.observe(button.querySelector('[data-pill-label]')!);
    }
    measure();
    return () => observer.disconnect();
  }, [track, buttons, optionCount]);

  return stacked;
}
