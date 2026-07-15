import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import { TrashIcon, EditIcon, PlusIcon } from '../../components/ui/icons';
import { formatDateTime } from '../../utils/datetime';
import { useCourseExamDates, useLessons } from '../../state/useCourseData';
import {
  createCourseExamDate,
  updateCourseExamDate,
  deleteCourseExamDate,
} from '../../db/repository';

export interface ExamDatesSectionProps {
  courseId: string;
  timeZone?: string;
}

interface DraftExamDate {
  name: string;
  examDate: number;
  lessonIds?: string[];
}

const EMPTY_DRAFT = (): DraftExamDate => ({ name: '', examDate: Date.now(), lessonIds: undefined });

/**
 * Course-only exam-date management: the extra assessment dates and lesson-scoped
 * checkpoints (`CourseExamDate[]`) the FSRS scheduler targets alongside the course's
 * primary exam date. Reads via `useCourseExamDates`/`useLessons`, writes directly to
 * the repository (no data lives in this component's own state beyond the add/edit form).
 */
export function ExamDatesSection({ courseId, timeZone }: ExamDatesSectionProps) {
  const examDates = useCourseExamDates(courseId);
  const lessons = useLessons(courseId);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftExamDate>(EMPTY_DRAFT());

  function startAdd() {
    setDraft(EMPTY_DRAFT());
    setEditingId('new');
  }

  function startEdit(id: string) {
    const existing = examDates?.find((d) => d.id === id);
    if (!existing) return;
    setDraft({ name: existing.name, examDate: existing.examDate, lessonIds: existing.lessonIds });
    setEditingId(id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT());
  }

  async function save() {
    const name = draft.name.trim() || 'Untitled date';
    if (editingId === 'new') {
      await createCourseExamDate(courseId, name, draft.examDate, { lessonIds: draft.lessonIds });
    } else if (editingId) {
      await updateCourseExamDate(editingId, {
        name,
        examDate: draft.examDate,
        lessonIds: draft.lessonIds,
      });
    }
    cancel();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete '${name}'? This cannot be undone.`)) return;
    await deleteCourseExamDate(id);
    if (editingId === id) cancel();
  }

  function toggleLesson(lessonId: string) {
    setDraft((d) => {
      const current = d.lessonIds ?? [];
      const next = current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId];
      return { ...d, lessonIds: next.length > 0 ? next : undefined };
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-faint">
        Extra assessment dates the scheduler can target instead of the primary exam date.
        Scope one to specific lessons to create a checkpoint (e.g. a mock exam covering
        only the lessons taught so far); leave it unscoped to cover every lesson to date.
      </p>

      {examDates?.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
        >
          <div className="min-w-0">
            <div className="text-sm text-ink">{entry.name}</div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {formatDateTime(entry.examDate, timeZone)}
              {entry.lessonIds && entry.lessonIds.length > 0
                ? ` · checkpoint (${entry.lessonIds.length} lesson${entry.lessonIds.length === 1 ? '' : 's'})`
                : ''}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => startEdit(entry.id)} aria-label={`Edit ${entry.name}`}>
              <EditIcon width={16} height={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove(entry.id, entry.name)} aria-label={`Delete ${entry.name}`}>
              <TrashIcon width={16} height={16} />
            </Button>
          </div>
        </div>
      ))}

      {editingId ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
          <label className="block text-sm text-ink-soft">
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Mock exam"
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>

          <DateTimePicker
            value={draft.examDate}
            onChange={(ms) => setDraft((d) => ({ ...d, examDate: ms }))}
            timeZone={timeZone}
            label="Date and time"
          />

          {lessons && lessons.length > 0 && (
            <div className="block text-sm text-ink-soft">
              <div className="mb-2">Scope to lessons (optional)</div>
              <div className="flex flex-wrap gap-2">
                {lessons.map((lesson) => {
                  const active = draft.lessonIds?.includes(lesson.id) ?? false;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => toggleLesson(lesson.id)}
                      aria-pressed={active}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition-colors ' +
                        (active
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-line text-ink-soft hover:border-line-strong')
                      }
                    >
                      {lesson.name}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 block text-xs text-ink-faint">
                Leave none selected to cover every lesson taught so far.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={startAdd} className="self-start">
          <PlusIcon width={16} height={16} />
          Add date
        </Button>
      )}
    </div>
  );
}
