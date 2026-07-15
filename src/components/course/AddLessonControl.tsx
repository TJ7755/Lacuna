import { useState } from 'react';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { createLesson } from '../../db/repository';
import type { Lesson } from '../../db/types';

/** Suggested name for the next lesson in a course (e.g. "Lesson 2"). */
export function defaultLessonName(lessonCount: number): string {
  return `Lesson ${Math.max(1, lessonCount + 1)}`;
}

export interface AddLessonControlProps {
  courseId: string;
  /** Current lessons, used to suggest the next default name. */
  lessonCount: number;
  /** Called after a lesson is created successfully. */
  onCreated?: (lesson: Lesson) => void;
}

/**
 * Inline add-lesson form with a toggle button. Used on the course path, in lesson
 * management settings, and on single-lesson course views where the path is hidden.
 */
export function AddLessonControl({ courseId, lessonCount, onCreated }: AddLessonControlProps) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => defaultLessonName(lessonCount));
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setName(defaultLessonName(lessonCount));
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setName(defaultLessonName(lessonCount));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const lesson = await createLesson(courseId, trimmed);
      setOpen(false);
      onCreated?.(lesson);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create the lesson.', 'negative');
    } finally {
      setSaving(false);
    }
  }

  if (open) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
        <label className="block text-sm text-ink-soft">
          Lesson name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancel();
            }}
            placeholder="e.g. Elasticity"
            autoFocus
            disabled={saving}
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent disabled:opacity-40"
          />
        </label>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create lesson'}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={startAdd} className="self-start">
      <PlusIcon width={16} height={16} />
      Add lesson
    </Button>
  );
}
