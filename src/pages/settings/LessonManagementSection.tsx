import { inputFrameClassName } from '../../components/ui/Field';
import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { AddLessonControl } from '../../components/course/AddLessonControl';
import { ChevronDownIcon, TrashIcon, EditIcon } from '../../components/ui/icons';
import { useLessonOrderData } from '../../state/useLessonOrderData';
import {
  updateLesson,
  deleteLesson,
  reorderLessons,
  setLocalLessonOrder,
} from '../../db/lessonRepository';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useActionFocus } from '../../hooks/useActionFocus';
import { useToast } from '../../components/ui/Toast';

export interface LessonManagementSectionProps {
  courseId: string;
}

/**
 * Course-only lesson management: rename, reorder and delete lessons on the course
 * path. Locked copies expose only the guarded local traversal preference.
 */
export function LessonManagementSection({ courseId }: LessonManagementSectionProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const data = useLessonOrderData(courseId);
  const lessons = data?.lessons;
  const locked = data?.course.distributedCopy?.locked === true;
  const canAuthor = !!data && !locked;
  const canMove = !!data && (canAuthor || !data.unavailableReason);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const renameOpener = useRef<HTMLElement | null>(null);
  const { remember, restore } = useActionFocus();
  const { notify } = useToast();

  useEffect(() => {
    if (!editingId) restore(renameOpener.current);
  }, [editingId, restore]);

  function startEdit(id: string, currentName: string) {
    renameOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    remember();
    setEditingId(id);
    setNameDraft(currentName);
  }

  // As in the lesson header: a blank or unchanged name cancels, a failed save keeps the
  // field open, and Enter followed by the unmount's blur saves once.
  const renaming = useRef(false);
  async function commitRename() {
    if (!canAuthor || renaming.current || !editingId) return;
    const name = nameDraft.trim();
    if (!name || name === lessons?.find((lesson) => lesson.id === editingId)?.name) {
      setEditingId(null);
      return;
    }
    renaming.current = true;
    try {
      await updateLesson(editingId, { name });
      setEditingId(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not rename the lesson.', 'negative');
    } finally {
      renaming.current = false;
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!lessons || !canMove || saving) return;
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const orderedIds = lessons.map((l) => l.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    try {
      setSaving(true);
      if (locked) await setLocalLessonOrder(courseId, orderedIds);
      else await reorderLessons(courseId, orderedIds);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not reorder the lessons.', 'negative');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      await setLocalLessonOrder(courseId);
      notify('Using publisher lesson order.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not reset lesson order.', 'negative');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!canAuthor) return;
    try {
      await deleteLesson(id);
      setConfirmDeleteId(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete the lesson.', 'negative');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h3 className="font-semibold text-ink">{locked ? 'Lesson order' : 'Manage lessons'}</h3>
          {locked && (
            <p className="mt-1 text-sm text-ink-soft">
              Reorder lessons for your copy. Updates from the author and your progress are kept, and
              new lessons appear at the end.
            </p>
          )}
        </div>
        {locked && data?.course.localLessonOrder && (
          <Button variant="secondary" size="sm" disabled={saving} onClick={() => void reset()}>
            Use publisher order
          </Button>
        )}
      </div>
      {locked && data?.unavailableReason && (
        <p role="status" className="text-sm text-ink-soft">
          {data.course.localLessonOrder ? 'Saved lesson order is suspended. ' : ''}
          {data.unavailableReason} Using publisher order.
        </p>
      )}
      {lessons?.length === 0 && (
        <p className="text-sm text-ink-faint">This course has no lessons yet.</p>
      )}
      {!!lessons?.length && (
        <div className="@container divide-y divide-line rounded-2xl border border-line">
          {lessons?.map((lesson, index) => (
            <motion.div
              key={lesson.id}
              layout={multiplier > 0 ? 'position' : undefined}
              transition={{ duration: 0.2 * multiplier, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Let enlarged text use the full row before placing actions beneath it. */}
              <div className="grid grid-cols-2 items-center gap-2 px-1 py-0.5 @min-[18rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
                <div className="row-start-2 flex @min-[18rem]:row-start-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void move(index, -1)}
                    disabled={!canMove || saving || index === 0}
                    aria-label={`Move ${lesson.name} up`}
                    className="min-w-11 px-0"
                  >
                    <ChevronDownIcon width={16} height={16} className="rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void move(index, 1)}
                    disabled={!canMove || saving || index === lessons.length - 1}
                    aria-label={`Move ${lesson.name} down`}
                    className="min-w-11 px-0"
                  >
                    <ChevronDownIcon width={16} height={16} />
                  </Button>
                </div>
                {canAuthor && editingId === lesson.id ? (
                  <input
                    autoFocus
                    aria-label="Lesson name"
                    value={nameDraft}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className={`col-span-2 col-start-1 row-start-1 min-h-11 min-w-0 w-full @min-[18rem]:col-span-1 @min-[18rem]:col-start-2 ${inputFrameClassName} text-sm`}
                  />
                ) : (
                  // Inset by the rename field's border and padding so the name does not shift when editing.
                  <span className="col-span-2 col-start-1 row-start-1 min-w-0 py-2 pl-[15.5px] text-sm text-ink [overflow-wrap:anywhere] @min-[18rem]:col-span-1 @min-[18rem]:col-start-2">
                    {lesson.name}
                    {lesson.isExtension && (
                      <span className="ml-2 text-xs text-ink-faint">(extension)</span>
                    )}
                  </span>
                )}
                {canAuthor && (
                  <div className="col-start-2 row-start-2 flex justify-self-end @min-[18rem]:col-start-3 @min-[18rem]:row-start-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(lesson.id, lesson.name)}
                      aria-label={`Rename ${lesson.name}`}
                      className="min-w-11 px-0"
                    >
                      <EditIcon width={16} height={16} />
                    </Button>
                    <Button
                      ref={(button) => {
                        if (button) deleteButtons.current.set(lesson.id, button);
                        else deleteButtons.current.delete(lesson.id);
                      }}
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(lesson.id)}
                      aria-label={`Delete ${lesson.name}`}
                      className="min-w-11 px-0"
                    >
                      <TrashIcon width={16} height={16} />
                    </Button>
                  </div>
                )}
              </div>
              {canAuthor && confirmDeleteId === lesson.id && (
                <div data-lesson-delete-confirmation className="border-t border-line px-4 py-3">
                  <ConfirmInline
                    message={`Delete ${lesson.name}? Notes will be removed and cards unassigned.`}
                    confirmLabel="Delete lesson"
                    onConfirm={() => void remove(lesson.id)}
                    onCancel={() => {
                      setConfirmDeleteId(null);
                      deleteButtons.current.get(lesson.id)?.focus();
                    }}
                    announce
                    focusOnMount="cancel"
                    className="w-full flex-wrap gap-x-3 gap-y-2"
                  />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      {canAuthor && <AddLessonControl courseId={courseId} lessonCount={lessons?.length ?? 0} />}
    </div>
  );
}
