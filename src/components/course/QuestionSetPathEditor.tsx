import { QuestionSetChoices } from '../question-sets/QuestionSetChoices';
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
import './question-set-path.css';
import '../question-sets/question-sets.css';

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
      aria-label={node ? 'Edit practice questions' : 'Add practice questions'}
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
          <h2>{node ? 'Edit practice questions' : 'Add practice questions'}</h2>
        </header>
        <div className="qs-path-fields">
          <QuestionSetChoices
            label="Question set"
            value={setId}
            disabled={busy || !!node}
            onChange={setSetId}
            options={data?.sets.map((set) => ({ value: set.id, label: set.title })) ?? []}
          />
          {data?.sets.length === 0 && <p>Save a question set before adding it to the path.</p>}
          <QuestionSetChoices
            label="After lesson"
            value={lessonId}
            disabled={busy}
            onChange={setLessonId}
            options={
              data?.lessons.map((lesson) => ({ value: lesson.id, label: lesson.name })) ?? []
            }
          />
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
