// Shared form fields for authoring a manual practice node: name, which gap on the
// path it occupies, which lessons' cards it draws from, an optional card limit and
// whether to randomise order. Used by both PracticeNodeEditor (the path-triggered
// modal) and PracticeNodesSection (the course-settings management list) so the two
// surfaces stay in lockstep.
//
// Filters (CardFilter[]) are intentionally not exposed here: no filter-builder UI
// exists elsewhere in the codebase to reuse, and the field stays supported in
// storage for a future filter UI.
//
// British English throughout.

import { Toggle } from '../ui/Toggle';
import { cn } from '../ui/cn';
import type { Lesson } from '../../db/types';
import type { PracticeNodeDraft } from './practiceNodeDraft';

interface PracticeNodeFieldsProps {
  draft: PracticeNodeDraft;
  onChange: (updater: (d: PracticeNodeDraft) => PracticeNodeDraft) => void;
  lessons: Lesson[];
}

export function PracticeNodeFields({ draft, onChange, lessons }: PracticeNodeFieldsProps) {
  const sortedLessons = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);

  function toggleLesson(lessonId: string) {
    onChange((d) => {
      const current = d.lessonIds ?? [];
      const next = current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId];
      return { ...d, lessonIds: next.length > 0 ? next : undefined };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block text-sm text-ink-soft">
        Name
        <input
          value={draft.name}
          onChange={(e) => onChange((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Weekly review"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </label>

      {sortedLessons.length > 0 && (
        <label className="block text-sm text-ink-soft">
          Position on the path
          <select
            value={draft.position ?? ''}
            onChange={(e) =>
              onChange((d) => ({
                ...d,
                position: e.target.value === '' ? undefined : Number(e.target.value),
              }))
            }
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
          >
            <option value="">Start of course</option>
            {sortedLessons.map((lesson) => (
              <option key={lesson.id} value={lesson.orderIndex}>
                After &ldquo;{lesson.name}&rdquo;
              </option>
            ))}
          </select>
        </label>
      )}

      {sortedLessons.length > 0 && (
        <div className="block text-sm text-ink-soft">
          <div className="mb-2">Cards from (optional)</div>
          <div className="flex flex-wrap gap-2">
            {sortedLessons.map((lesson) => {
              const active = draft.lessonIds?.includes(lesson.id) ?? false;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => toggleLesson(lesson.id)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  {lesson.name}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-ink-faint">
            Leave none selected to draw from every lesson in the course.
          </span>
        </div>
      )}

      <label className="block text-sm text-ink-soft">
        Card limit (optional)
        <input
          type="number"
          min={1}
          value={draft.cardCount}
          onChange={(e) => onChange((d) => ({ ...d, cardCount: e.target.value }))}
          placeholder="No limit"
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-ink-soft">Randomise order</div>
          <p className="text-xs text-ink-faint">Shuffle the cards instead of following lesson order.</p>
        </div>
        <Toggle
          checked={draft.randomize}
          onChange={(checked) => onChange((d) => ({ ...d, randomize: checked }))}
        />
      </div>
    </div>
  );
}
