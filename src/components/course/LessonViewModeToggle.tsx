import { cn } from '../ui/cn';
import type { LessonViewMode } from '../../state/lessonViewMode';

/**
 * Compact Read/Edit segmented control for a course's lesson view mode. Used
 * in the CoursePath and inline single-lesson (LessonView) headers, right next
 * to the settings link, so the mode is visible and changeable without a trip
 * to Course settings. Writes course.lessonViewMode directly — see
 * src/course/lessonViewMode.ts for how the mode is resolved and
 * src/pages/settings/LessonViewModeSection.tsx for the equivalent control in
 * Course settings.
 */
export function LessonViewModeToggle({
  mode,
  onChange,
}: {
  mode: LessonViewMode;
  onChange: (mode: LessonViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Lesson view mode"
      className="inline-flex h-8 shrink-0 items-center rounded-full border border-line bg-ink/5 p-0.5 text-xs"
    >
      {(['study', 'edit'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-full items-center rounded-full px-3 font-medium transition-colors',
            mode === option
              ? 'bg-surface text-ink shadow-sm shadow-black/[0.04]'
              : 'text-ink-faint hover:text-ink',
          )}
        >
          {option === 'study' ? 'Read' : 'Edit'}
        </button>
      ))}
    </div>
  );
}
