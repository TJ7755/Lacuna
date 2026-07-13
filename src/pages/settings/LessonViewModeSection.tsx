import { Toggle } from '../../components/ui/Toggle';
import type { LessonViewMode } from '../../state/lessonViewMode';

export interface LessonViewModeSectionProps {
  /** Undefined means "inherit the global default". */
  lessonViewMode: LessonViewMode | undefined;
  onLessonViewModeChange: (mode: LessonViewMode | undefined) => void;
}

/**
 * Course-only override of the global lesson-view-mode default (see
 * src/pages/Settings.tsx and src/state/lessonViewMode.ts). A three-way toggle
 * isn't warranted here — the course either follows the global default or
 * pins its own — so this renders as an "override" switch plus, once enabled,
 * a study/edit choice. Pure controlled component — all state lives with the
 * caller.
 */
export function LessonViewModeSection({
  lessonViewMode,
  onLessonViewModeChange,
}: LessonViewModeSectionProps) {
  const overriding = lessonViewMode !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Pin how lessons in this course open, regardless of the site-wide default.
        </p>
        <Toggle
          checked={overriding}
          onChange={(checked) => onLessonViewModeChange(checked ? 'study' : undefined)}
          label="Override default"
        />
      </div>

      {overriding && (
        <fieldset className="border-t border-line pt-4 text-sm text-ink-soft">
          <legend className="sr-only">Lesson view mode</legend>
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
                <span className="block text-sm text-ink">Study</span>
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
      )}
    </div>
  );
}
