import { cn } from '../ui/cn';
import type { LessonViewMode } from '../../state/lessonViewMode';

/**
 * Compact Study/Author workspace control. Both options write the course's one
 * shared mode, so moving between the path and a lesson never creates another
 * local workspace-mode decision.
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
      aria-label="Workspace mode"
      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-line bg-ink/5 p-0.5 text-xs"
    >
      {(['study', 'edit'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          aria-label={option === 'study' ? 'Study mode' : 'Author mode'}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-full items-center rounded-lg px-3 font-medium transition-colors',
            mode === option
              ? 'bg-surface text-ink shadow-sm shadow-black/[0.04]'
              : 'text-ink-faint hover:text-ink',
          )}
        >
          {option === 'study' ? 'Study' : 'Author'}
        </button>
      ))}
    </div>
  );
}
