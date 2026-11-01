// Gaps' own copies of the study app's expanding controls, disclosures, segmented pills and course
// glyph. Those use the animation runtime, which the teacher bundle excludes; these use gaps.css.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../components/ui/cn';
import { ChevronDownIcon, PlusIcon } from '../components/ui/icons';
import { band, type Band } from './classInsights';

const EXIT_MS = 180;
/** Matches the expansion transitions in gaps.css. */
const EXPAND_MS = 460;

/** Keeps a closing element mounted long enough for its exit animation. */
export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  useEffect(() => {
    if (open || !rendered) return;
    const timer = setTimeout(() => setRendered(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, rendered, exitMs]);
  return { rendered: open || rendered, closing: !open && rendered };
}

/** The last content shown while open, so an exit animation does not render an empty panel. */
function useLatest<T>(value: T, keep: boolean): T {
  const latest = useRef(value);
  if (keep) latest.current = value;
  return keep ? value : latest.current;
}

/** Creation expands from its trigger, keeping the page in place, as the study app's controls do. */
export function ExpandingAction({
  label,
  open,
  onOpenChange,
  closedWidth = 176,
  align = 'end',
  className,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  closedWidth?: number;
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const [geometry, setGeometry] = useState({ width: 448, offset: 0 });
  const { rendered } = usePresence(open, EXPAND_MS);

  // Clamp the open surface to the viewport without moving the trigger it grows from.
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(448, window.innerWidth - 36);
      const left = align === 'start' ? bounds.left : bounds.right - width;
      setGeometry({
        width,
        offset: Math.min(Math.max(18, left), window.innerWidth - 18 - width) - left,
      });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, align]);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) focusFirstField(root.current);
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = () => onOpenChange(false);
  const offset = open ? geometry.offset : 0;
  return (
    <div
      ref={root}
      className={cn('relative h-11 shrink-0', open ? 'z-[7]' : 'z-[5]', className)}
      style={{ width: closedWidth }}
    >
      <div
        data-open={open || undefined}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open || event.defaultPrevented) return;
          event.preventDefault();
          close();
        }}
        className={cn(
          'gaps-expand absolute top-0 overflow-hidden bg-surface-raised ring-1 ring-inset',
          align === 'start' ? 'left-0' : 'right-0',
          open
            ? 'rounded-[24px] ring-transparent card-surface shadow-[0_24px_48px_-28px_hsl(0_0%_0%/0.5)]'
            : 'rounded-[22px] ring-line-strong',
        )}
        style={{ width: open ? geometry.width : closedWidth, transform: `translateX(${offset}px)` }}
      >
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            'gaps-expand-trigger flex h-11 items-center justify-center gap-2 px-3 text-sm font-semibold text-ink focus-visible:outline-offset-[-3px]',
            align === 'end' && 'ml-auto',
          )}
          style={{ width: closedWidth, transform: `translateX(${-offset}px)` }}
        >
          <PlusIcon width={16} height={16} className="gaps-turn" />
          {label}
        </button>
        <Disclosure open={open} id={contentId} className="px-6 pb-6 pt-2">
          {rendered && (typeof children === 'function' ? children(close) : children)}
        </Disclosure>
      </div>
    </div>
  );
}

/**
 * Content that opens in place, growing from nothing to its own height. Closed content stays
 * mounted for the exit, but is inert so it cannot take focus.
 */
export function Disclosure({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const { rendered } = usePresence(open, EXPAND_MS);
  const content = useLatest(children, open);
  return (
    <div
      id={id}
      data-open={open || undefined}
      inert={!open}
      aria-hidden={!open || undefined}
      className="gaps-disclosure"
    >
      <div>
        <div className={className}>{rendered && content}</div>
      </div>
    </div>
  );
}

/** A chevron that turns as its disclosure opens, as the study app's settings rows do. */
export function DisclosureChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDownIcon
      width={18}
      height={18}
      aria-hidden="true"
      data-open={open || undefined}
      className={cn('gaps-turn shrink-0 text-ink-faint', className)}
    />
  );
}

export function focusFirstField(root: HTMLElement | null) {
  root
    ?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea')
    ?.focus({ preventScroll: true });
}

/**
 * Measures the selected element and slides a pill behind it. The first placement is
 * instant, so the pill never flies in from the corner on load.
 */
export function useSlidingIndicator(selectedKey: string | null) {
  const container = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties & { ready?: boolean }>({ opacity: 0 });
  const placed = useRef(false);

  useLayoutEffect(() => {
    function place() {
      const root = container.current;
      const target = root?.querySelector<HTMLElement>('[data-indicator-target="true"]');
      if (!root || !target) {
        setStyle((current) => ({ ...current, opacity: 0 }));
        return;
      }
      const box = root.getBoundingClientRect(),
        rect = target.getBoundingClientRect();
      setStyle({
        opacity: 1,
        width: rect.width,
        height: rect.height,
        transform: `translate(${rect.left - box.left + root.scrollLeft}px, ${rect.top - box.top + root.scrollTop}px)`,
        ready: placed.current,
      });
      placed.current = true;
    }
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [selectedKey]);

  const { ready, ...css } = style;
  return { container, indicatorProps: { style: css, 'data-instant': ready ? undefined : '' } };
}

export function SlidingTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}) {
  const { container, indicatorProps } = useSlidingIndicator(value);
  function onKeyDown(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowLeft'
          ? -1
          : event.key === 'Home'
            ? -index
            : 0;
    if (!step) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    container.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }
  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      className="relative inline-flex max-w-full rounded-full bg-ink/[0.06] p-1"
    >
      <span
        aria-hidden="true"
        {...indicatorProps}
        className="gaps-indicator absolute left-0 top-0 rounded-full bg-surface shadow-[0_1px_3px_hsl(var(--ink)/0.14)]"
      />
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          data-value={option.value}
          data-indicator-target={option.value === value}
          aria-selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            'hit-target relative min-h-10 rounded-full px-5 text-sm font-semibold transition-colors duration-200',
            option.value === value ? 'text-ink' : 'text-ink-soft hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const BAND_COLOUR: Record<Band, string> = {
  secure: 'hsl(var(--positive))',
  partial: 'hsl(var(--warning))',
  gap: 'hsl(var(--negative))',
  unknown: 'hsl(var(--ink-faint) / 0.5)',
};

export const BAND_LABEL: Record<Band, string> = {
  secure: 'Secure',
  partial: 'Partly',
  gap: 'Gap',
  unknown: 'Unknown',
};

export function BandDot({ score, className }: { score: number | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ background: BAND_COLOUR[band(score)] }}
    />
  );
}

export function ScoreBar({
  score,
  index = 0,
  className,
}: {
  score: number | null;
  index?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block h-1.5 overflow-hidden rounded-full bg-ink/10', className)}
    >
      <span
        className="gaps-bar block h-full rounded-full"
        style={
          {
            width: `${Math.round((score ?? 0) * 100)}%`,
            background: BAND_COLOUR[band(score)],
            '--i': index,
          } as CSSProperties
        }
      />
    </span>
  );
}

// The study app's course ring: open at the top, 300 degrees round.
const RING = 'M32.99 12.5 A15 15 0 1 1 7.01 12.5';

/**
 * A class at a glance, drawn like a course glyph: a padlock while locked, then the
 * day's report count in the centre with the class's secure share as the ring.
 */
export function ClassGlyph({
  locked,
  count,
  score,
  size = 30,
}: {
  locked: boolean;
  count?: number;
  score?: number | null;
  size?: number;
}) {
  const fill = locked || score === null || score === undefined ? 0 : Math.max(0.04, score);
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" className="block h-full w-full">
        <path
          d={RING}
          fill="none"
          className="stroke-line-strong"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        {fill > 0 && (
          <path
            d={RING}
            fill="none"
            pathLength={1}
            strokeDasharray="1 1"
            className="gaps-ring"
            style={{ strokeDashoffset: 1 - fill }}
            stroke={BAND_COLOUR[band(score ?? null)]}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        )}
        {locked ? (
          <g
            className="text-ink-soft"
            stroke="currentColor"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          >
            <rect x="14.5" y="19" width="11" height="8.5" rx="1.8" />
            <path d="M17 19v-2.6a3 3 0 0 1 6 0V19" />
          </g>
        ) : count !== undefined ? (
          <text
            x="20"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink font-display font-semibold"
            style={{ fontSize: count > 99 ? 10 : 14 }}
          >
            {count}
          </text>
        ) : (
          <circle cx="20" cy="21" r="2.5" className="fill-ink-faint" />
        )}
      </svg>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'gaps-spinner inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

export function RememberClassCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      Remember this class on this device
    </label>
  );
}
