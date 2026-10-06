import { LazyCardImportDialog as CardImportDialog } from '../import/LazyCardImportDialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { createLesson } from '../../db/lessonRepository';
import type { Lesson } from '../../db/types';
import { Field, Input } from '../ui/Field';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { dialogKeyDown } from '../../hooks/dialogKeys';

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
  const trigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const previouslyOpen = useRef(open);
  useEffect(() => {
    if (open && !importingCards) nameInput.current?.focus();
    if (!open && previouslyOpen.current) trigger.current?.focus();
    previouslyOpen.current = open;
  }, [open, importingCards]);

  function startAdd() {
    setName(defaultLessonName(lessonCount));
    setOpen(true);
  }

  function cancel() {
    if (saving) return;
    setOpen(false);
    setName(defaultLessonName(lessonCount));
    onCancel?.();
  }

  async function save() {
    const trimmed = name.trim();
    if (saving || !trimmed) return;
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
          notify(`${result.count} cards imported.`, 'positive');
          onCreated?.(result.lesson!);
        }}
      />
    );

  return (
    <>
      <div className="contents" inert={!open} aria-hidden={!open || undefined}>
        <AnimatedDisclosure open={open}>
          <div
            onKeyDown={dialogKeyDown({
              onCancel: cancel,
              onSubmit: () => void save(),
              enterSubmits: true,
            })}
            className="flex w-full flex-col gap-3 rounded-3xl bg-surface px-4 py-3 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]"
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
        </AnimatedDisclosure>
      </div>
      {/* A caller that supplies onCancel owns the trigger and the collapse. */}
      {!open && !onCancel && (
        <Button
          ref={trigger}
          variant="secondary"
          size="sm"
          onClick={startAdd}
          className="self-start"
        >
          <PlusIcon width={16} height={16} />
          Add lesson
        </Button>
      )}
    </>
  );
}
