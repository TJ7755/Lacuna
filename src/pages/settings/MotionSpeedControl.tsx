import { useRef } from 'react';
import { speedMultiplier, useMotionSpeed, type MotionSpeed } from '../../state/motionSpeed';
import { cn } from '../../components/ui/cn';

const OPTIONS: { value: MotionSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const POSITION_CLASSES = [
  { fill: 'w-0', thumb: 'left-0' },
  { fill: 'w-1/2', thumb: 'left-1/2' },
  { fill: 'w-full', thumb: 'left-full' },
] as const;

interface MotionSpeedControlProps {
  value: MotionSpeed;
  onChange: (value: MotionSpeed) => void;
  describedBy?: string;
}

export function MotionSpeedControl({ value, onChange, describedBy }: MotionSpeedControlProps) {
  useMotionSpeed();
  const multiplier = speedMultiplier(value);
  const movement = {
    transitionDuration: `${380 * multiplier}ms`,
    transitionTimingFunction: 'cubic-bezier(0.22, 1.35, 0.36, 1)',
  };
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = OPTIONS.findIndex((option) => option.value === value);
  const position = POSITION_CLASSES[selectedIndex];

  const selectAndFocus = (index: number) => {
    onChange(OPTIONS[index].value);
    buttonRefs.current[index]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Animation speed"
      aria-describedby={describedBy}
      className="relative grid h-12 grid-cols-3"
      data-motion-speed-control
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/6 right-1/6 top-0 h-8 rounded-lg border border-line bg-ink/5 shadow-inner"
      >
        <span
          data-testid="motion-speed-fill"
          style={movement}
          className={cn(
            'absolute inset-y-0 left-0 rounded-lg bg-accent/10 transition-[width] motion-reduce:transition-none',
            position.fill,
          )}
        />
        {POSITION_CLASSES.map((marker, index) => (
          <span
            key={marker.thumb}
            className={cn(
              'absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
              index === selectedIndex ? 'bg-accent' : 'bg-line-strong',
              marker.thumb,
            )}
          />
        ))}
        <span
          data-testid="motion-speed-thumb"
          style={movement}
          className={cn(
            'absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line-strong bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.12)] transition-[left] motion-reduce:transition-none',
            position.thumb,
          )}
        />
      </div>

      {OPTIONS.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
              } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                nextIndex = (index + 1) % OPTIONS.length;
              } else if (event.key === 'Home') {
                nextIndex = 0;
              } else if (event.key === 'End') {
                nextIndex = OPTIONS.length - 1;
              }
              if (nextIndex === null) return;
              event.preventDefault();
              selectAndFocus(nextIndex);
            }}
            className={cn(
              'relative z-10 flex min-h-11 items-end justify-center rounded-lg pb-0.5 text-xs transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset motion-reduce:transition-none',
              selected ? 'font-medium text-accent' : 'text-ink-faint',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
