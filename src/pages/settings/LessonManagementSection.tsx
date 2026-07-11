import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ChevronDownIcon, TrashIcon, EditIcon } from '../../components/ui/icons';
import { useLessons } from '../../state/useCourseData';
import { updateLesson, deleteLesson, reorderLessons } from '../../db/repository';
import type { Lesson } from '../../db/types';

export interface LessonManagementSectionProps {
  courseId: string;
}

/** Plain-language options for what a lesson's `/learn` session studies. */
const SESSION_FILTER_OPTIONS: { value: NonNullable<Lesson['sessionFilter']>; label: string; description: string }[] = [
  { value: 'new', label: 'New material', description: "Cards the student hasn't seen yet" },
  { value: 'due', label: 'Revision', description: 'Cards the memory schedule says are due' },
  { value: 'mixed', label: 'Both', description: 'Both new material and due revision' },
];

/**
 * Course-only lesson management: rename, reorder and delete lessons on the course
 * path. Ordered by `orderIndex` via `useLessons`. Reordering swaps two adjacent
 * lessons and persists via a single `reorderLessons` call; deletion cascades in the
 * repository (notes, lesson-card links, card unassignment) so a plain confirm suffices.
 */
export function LessonManagementSection({ courseId }: LessonManagementSectionProps) {
  const lessons = useLessons(courseId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  function startEdit(id: string, currentName: string) {
    setEditingId(id);
    setNameDraft(currentName);
  }

  async function commitRename() {
    if (editingId) {
      const name = nameDraft.trim();
      if (name) await updateLesson(editingId, { name });
    }
    setEditingId(null);
  }

  async function move(index: number, direction: -1 | 1) {
    if (!lessons) return;
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const orderedIds = lessons.map((l) => l.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    await reorderLessons(courseId, orderedIds);
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete '${name}'? Its notes will be removed and its cards unassigned.`)) return;
    await deleteLesson(id);
  }

  async function setSessionFilter(id: string, value: NonNullable<Lesson['sessionFilter']>) {
    await updateLesson(id, { sessionFilter: value === 'new' ? undefined : value });
  }

  return (
    <div className="flex flex-col gap-2">
      {lessons?.length === 0 && (
        <p className="text-xs text-ink-faint">This course has no lessons yet.</p>
      )}
      {lessons?.map((lesson, index) => (
        <div
          key={lesson.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => void move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${lesson.name} up`}
                className="text-ink-faint hover:text-ink disabled:opacity-30"
              >
                <ChevronDownIcon width={14} height={14} className="rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => void move(index, 1)}
                disabled={index === lessons.length - 1}
                aria-label={`Move ${lesson.name} down`}
                className="text-ink-faint hover:text-ink disabled:opacity-30"
              >
                <ChevronDownIcon width={14} height={14} />
              </button>
            </div>
            {editingId === lesson.id ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
              />
            ) : (
              <span className="truncate text-sm text-ink">
                {lesson.name}
                {lesson.isExtension && (
                  <span className="ml-2 text-xs text-ink-faint">(extension)</span>
                )}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={lesson.sessionFilter ?? 'new'}
              onChange={(e) =>
                void setSessionFilter(lesson.id, e.target.value as NonNullable<Lesson['sessionFilter']>)
              }
              aria-label={`Session type for ${lesson.name}`}
              title="What this lesson's study session covers"
              className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
            >
              {SESSION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startEdit(lesson.id, lesson.name)}
              aria-label={`Rename ${lesson.name}`}
            >
              <EditIcon width={16} height={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove(lesson.id, lesson.name)}
              aria-label={`Delete ${lesson.name}`}
            >
              <TrashIcon width={16} height={16} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
