import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSetPracticeNode } from '../../db/types';
import {
  createQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
  deleteQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { PlusIcon } from '../ui/icons';
import './question-set-path.css';

export function AddQuestionSetPractice({
  courseId,
  afterLessonId,
}: {
  courseId: string;
  afterLessonId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" disabled={!afterLessonId} onClick={() => setOpen(true)}>
        <PlusIcon width={16} height={16} />
        Add Practice Qs
      </Button>
      {open && (
        <QuestionSetPathEditor
          courseId={courseId}
          afterLessonId={afterLessonId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function QuestionSetPathEditor({
  courseId,
  node,
  afterLessonId,
  onClose,
}: {
  courseId: string;
  node?: QuestionSetPracticeNode;
  afterLessonId?: string;
  onClose: () => void;
}) {
  const trap = useFocusTrap(true);
  const data = useLiveQuery(
    () =>
      db.transaction('r', [db.questionSets, db.lessons], async () => ({
        sets: await db.questionSets.where('courseId').equals(courseId).toArray(),
        lessons: (await db.lessons.where('courseId').equals(courseId).toArray()).sort(
          (a, b) => a.orderIndex - b.orderIndex,
        ),
      })),
    [courseId],
  );
  const [setId, setSetId] = useState(node?.questionSetId ?? '');
  const [lessonId, setLessonId] = useState(node?.afterLessonId ?? afterLessonId ?? '');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const run = async (remove = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (remove && node) await deleteQuestionSetPracticeNode(node.id);
      else if (node) await updateQuestionSetPracticeNode(node.id, lessonId);
      else await createQuestionSetPracticeNode(courseId, setId, lessonId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this activity.');
      setBusy(false);
    }
  };
  return createPortal(
    <div
      ref={trap}
      className="qs-path-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={node ? 'Edit Practice Qs' : 'Add Practice Qs'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <ModalBackdrop
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <section className="qs-path-panel">
        <header>
          <h2>{node ? 'Edit Practice Qs' : 'Add Practice Qs'}</h2>
        </header>
        <div className="qs-path-fields">
          <label>
            Question set
            <select
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.stopPropagation();
              }}
              value={setId}
              disabled={busy || !!node}
              onChange={(event) => setSetId(event.target.value)}
            >
              <option value="">Choose a set</option>
              {data?.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title}
                </option>
              ))}
            </select>
          </label>
          {data?.sets.length === 0 && <p>Save a question set before adding it to the path.</p>}
          <label>
            After lesson
            <select
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.stopPropagation();
              }}
              value={lessonId}
              disabled={busy}
              onChange={(event) => setLessonId(event.target.value)}
            >
              <option value="">Choose a lesson</option>
              {data?.lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.name}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-negative">
              {error}
            </p>
          )}
          {confirm && !busy && (
            <ConfirmInline
              message="Remove this activity? The question set and attempts will remain."
              confirmLabel="Remove activity"
              focusOnMount="cancel"
              onConfirm={() => void run(true)}
              onCancel={() => setConfirm(false)}
            />
          )}
        </div>
        <footer>
          {node && (
            <Button variant="ghost" disabled={busy || confirm} onClick={() => setConfirm(true)}>
              Remove activity
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !setId || !lessonId || confirm} onClick={() => void run()}>
            {busy ? 'Saving…' : node ? 'Save' : 'Add to path'}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
