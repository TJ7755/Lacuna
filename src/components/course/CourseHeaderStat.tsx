// Stat primitives for the shared course-cockpit header (see CourseHeader.tsx).
// Each stat pairs a value with a plain-language one-line descriptor so that
// distinct concepts — mastery (FSRS retention), position (pacing), due count —
// can never be conflated at a glance.

import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

interface CourseHeaderStatProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Plain-language one-liner disambiguating what this value measures. */
  description: string;
  className?: string;
}

/**
 * A single labelled stat block: icon, eyebrow label, value, and a small
 * descriptor line. Used for mastery, curriculum position, due-today and
 * exam-countdown stats across CourseHeader.
 */
export function CourseHeaderStat({
  icon,
  label,
  value,
  description,
  className,
}: CourseHeaderStatProps) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <div>
        <span className="text-xs uppercase tracking-[0.12em] text-ink-faint">{label}</span>
        <p className="mt-0.5 font-medium text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{description}</p>
      </div>
    </div>
  );
}
