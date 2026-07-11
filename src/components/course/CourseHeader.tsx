// Shared "course cockpit" header: exam eyebrow, serif title, and a standfirst
// line (see memoryField.ts's fieldStandfirst). Used by CoursePath (full
// course) and, in a leaner form, LessonView.

import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

interface CourseHeaderProps {
  /** e.g. "Exam 12 July 2026". */
  eyebrow: string;
  /** Pulses a small accent dot beside the eyebrow — reserve for an imminent exam. */
  examUrgent?: boolean;
  title: string;
  /** Content under the title — typically the standfirst paragraph. */
  children?: ReactNode;
  className?: string;
}

/**
 * Frame for a course/lesson header: eyebrow row, serif display title, and
 * caller-supplied content beneath (the standfirst), so the same frame serves
 * both the CoursePath header and LessonView's leaner adoption.
 */
export function CourseHeader({
  eyebrow,
  examUrgent = false,
  title,
  children,
  className,
}: CourseHeaderProps) {
  return (
    <header
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8',
        className,
      )}
    >
      <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
      <div className="relative">
        <div className="mb-1 flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-ink-faint">
          {examUrgent && (
            <span
              className="exam-pulse inline-block h-1.5 w-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
          )}
          {eyebrow}
        </div>
        <h1 className="mb-5 font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        {children && <div className="flex flex-wrap gap-x-8 gap-y-4">{children}</div>}
      </div>
    </header>
  );
}
