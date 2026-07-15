import type { LessonViewMode } from '../../state/lessonViewMode';

export interface LessonViewModeSectionProps {
  lessonViewMode: LessonViewMode;
  onLessonViewModeChange: (mode: LessonViewMode) => void;
}

/**
 * Direct Read/Edit choice for how lessons in this course open (see
 * src/course/lessonViewMode.ts for the resolution logic and
 * src/components/course/LessonViewModeToggle.tsx for the compact equivalent
 * in the course/lesson headers). Pure controlled component — all state
 * lives with the caller.
 */
export function LessonViewModeSection({
  lessonViewMode,
  onLessonViewModeChange,
}: LessonViewModeSectionProps) {
  return (
    <fieldset className="text-sm text-ink-soft">
      <legend className="mb-3 text-xs text-ink-faint">
        How lessons in this course open by default.
      </legend>
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="lessonViewMode"
            checked={lessonViewMode === 'study'}
            onChange={() => onLessonViewModeChange('study')}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="block text-sm text-ink">Read</span>
            <span className="block text-xs text-ink-faint">
              Lessons open as a read-only study page.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="lessonViewMode"
            checked={lessonViewMode === 'edit'}
            onChange={() => onLessonViewModeChange('edit')}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="block text-sm text-ink">Edit</span>
            <span className="block text-xs text-ink-faint">
              Lessons open straight into notes and cards editing.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
