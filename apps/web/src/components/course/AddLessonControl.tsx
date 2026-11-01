import { LazyCardImportDialog as CardImportDialog } from '../import/LazyCardImportDialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { useToast } from '../ui/Toast';
import { createLesson } from '../../db/lessonRepository';
import type { Lesson } from '../../db/types';
import { Field, Input } from '../ui/Field';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { countOf } from '../../utils/plural';

/** Suggested name for the next lesson in a course (e.g. "Lesson 2"). */
export function defaultLessonName(lessonCount: number): string {
  return `Lesson ${Math.max(1, lessonCount + 1)}`;
}

export interface AddLessonControlProps {
  courseId: string;
  /** Current lessons, used to suggest the next default name. */
  lessonCount: number;
  initiallyOpen?: boolean;
  onCancel?: () => void;
  /** Called after a lesson is created successfully. */
  onCreated?: (lesson: Lesson) => void;
}

/**
 * Inline add-lesson form with a toggle button. Used on the course path, in lesson
 * management settings, and on single-lesson course views where the path is hidden.
 */
export function AddLessonControl({
  courseId,
  lessonCount,
  onCreated,
  initiallyOpen = false,
  onCancel,
}: AddLessonControlProps) {
  const { notify } = useToast();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState(() => defaultLessonName(lessonCount));
  const [importingCards, setImportingCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Selected, so typing replaces the suggested name.
    if (open && !importingCards) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [open, importingCards]);

  function startAdd() {
    addedHere.current = 0;
    setName(defaultLessonName(lessonCount));
    setOpen(true);
  }

  function cancel() {
    if (saving) return;
    setOpen(false);
    addedHere.current = 0;
    setName(defaultLessonName(lessonCount));
    onCancel?.();
  }

  // Lessons this form has created since it last closed: the live count lags a creation.
  const addedHere = useRef(0);

  /** `another` keeps the form open with the next name, for building an outline. */
  async function save(another = false) {
    const trimmed = name.trim();
    if (saving || !trimmed) return;
    setSaving(true);
    try {
      const lesson = await createLesson(courseId, trimmed);
      if (another) {
        addedHere.current += 1;
        setName(defaultLessonName(lessonCount + addedHere.current));
        requestAnimationFrame(() => nameInput.current?.select());
        return;
      }
      addedHere.current = 0;
      setOpen(false);
      onCreated?.(lesson);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create the lesson.', 'negative');
    } finally {
      setSaving(false);
    }
  }

  if (importingCards)
    return (
      <CardImportDialog
        initialTitle={name}
        titleLabel="Lesson title"
        onCancel={() => setImportingCards(false)}
        onImport={async (content, title) => {
          const { importCardsToDestination } = await import('../../db/cardImport');
          const result = await importCardsToDestination(
            { kind: 'lesson', courseId, title },
            content,
          );
          setImportingCards(false);
          setOpen(false);
          notify(`${countOf(result.count, 'card')} imported.`, 'positive');
          onCreated?.(result.lesson!);
        }}
      />
    );

  const form = (
    <div
      onKeyDown={(event) => {
        // As in the card editor, Ctrl/Cmd+Enter creates and readies the next one.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          void save(true);
          return;
        }
        dialogKeyDown({
          onCancel: cancel,
          onSubmit: () => void save(),
          enterSubmits: true,
        })(event);
      }}
      className={`flex w-full flex-col gap-3 px-4 py-3 ${onCancel ? 'rounded-3xl bg-surface card-surface' : ''}`}
    >
      <Field label="Lesson name">
        <Input
          ref={nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Elasticity"
          autoFocus
          disabled={saving}
          className="disabled:opacity-40"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Creating…' : 'Create lesson'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void save(true)}
          disabled={saving || !name.trim()}
          title="Create and add another (Ctrl/Cmd+Enter)"
        >
          Create &amp; add another
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setImportingCards(true)}
          disabled={saving}
        >
          Import cards
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
  if (!onCancel)
    return (
      <ExpandingCreateControl
        align="start"
        label="Add lesson"
        open={open}
        onOpenChange={(next) => {
          if (next) startAdd();
          else cancel();
        }}
      >
        {form}
      </ExpandingCreateControl>
    );
  return (
    <div className="contents" inert={!open} aria-hidden={!open || undefined}>
      <AnimatedDisclosure open={open}>{form}</AnimatedDisclosure>
    </div>
  );
}
