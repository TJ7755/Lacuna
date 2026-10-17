import { PillToggleGroup } from '../cards/PillToggleGroup';
import type { LessonViewMode } from '../../state/lessonViewMode';

const OPTIONS = [
  { value: 'study', label: 'View', ariaLabel: 'View mode' },
  { value: 'edit', label: 'Edit', ariaLabel: 'Edit mode' },
] as const;

/**
 * View/Edit workspace control, drawn as a pill track with a sliding pill. Both
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
      // The compact size keeps its track the height of the section tabs beside it.
      size="sm"
      className="shrink-0"
    />
  );
}
