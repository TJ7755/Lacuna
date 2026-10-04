import { PillToggleGroup } from '../cards/PillToggleGroup';
import type { LessonViewMode } from '../../state/lessonViewMode';

const OPTIONS = [
  { value: 'study', label: 'Study', ariaLabel: 'Study mode' },
  { value: 'edit', label: 'Edit', ariaLabel: 'Author mode' },
] as const;

/**
 * Study/Author workspace control, drawn as a pill track with a sliding pill. Both
 * options write the course's one shared mode, so moving between the path and a
 * lesson never creates another local workspace-mode decision.
 */
export function LessonViewModeToggle({
  mode,
  onChange,
}: {
  mode: LessonViewMode;
  onChange: (mode: LessonViewMode) => void;
}) {
  return (
    <PillToggleGroup
      label="Workspace mode"
      options={OPTIONS}
      value={mode}
      onChange={onChange}
      className="shrink-0"
    />
  );
}
