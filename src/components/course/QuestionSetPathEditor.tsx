import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSetPracticeNode } from '../../db/types';
import {
  createQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
  deleteQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import { QuestionSetPicker } from '../question-sets/QuestionSetPicker';
import { listQuestionSets } from '../../questions/questionSetRepository';
import { PathEditorSurface } from './PathEditorSurface';
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
  const data = useLiveQuery(
    () =>
      db.transaction('r', [db.questionSets, db.lessons, db.concepts, db.courses], async () => ({
        sets: await listQuestionSets(courseId),
        concepts: await db.concepts.where('courseId').equals(courseId).toArray(),
        course: await db.courses.get(courseId),
        lessons: (await db.lessons.where('courseId').equals(courseId).toArray()).sort(
          (a, b) => a.orderIndex - b.orderIndex,
        ),
      })),
    [courseId],
  );
  const [setId, setSetId] = useState(node?.questionSetId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');
  const sentence = useRef<HTMLParagraphElement>(null);
  const title = data?.sets.find((set) => set.id === setId)?.title;
  async function save() {
    if (!node && !setId && data?.sets.length === 0) return true;
    const anchor = node?.afterLessonId ?? afterLessonId ?? data?.lessons.at(-1)?.id;
    if (!setId || !anchor) {
      setError(!setId ? 'Choose a question set.' : 'Add a lesson before this activity.');
      sentence.current?.querySelector<HTMLElement>('input, button')?.focus();
      return false;
    }
    try {
      if (node) await updateQuestionSetPracticeNode(node.id, anchor, setId);
      else await createQuestionSetPracticeNode(courseId, setId, anchor);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this activity.');
      return false;
    }
  }
  async function remove() {
    if (!node) return false;
    try {
      await deleteQuestionSetPracticeNode(node.id);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this activity.');
      return false;
    }
  }
  return (
    <PathEditorSurface
      label={node ? 'Edit practice questions' : 'Add practice questions'}
      onSave={save}
      onClosed={onClose}
      cancellable
      onDelete={node ? remove : undefined}
      deleteNoun="question-set activity"
    >
      <p ref={sentence} className="path-editor-sentence">
        Practise{' '}
        <button
          ref={trigger}
          type="button"
          data-path-editor-focus
          className="path-editor-chip"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(true)}
        >
          {title ?? (node && setId === node.questionSetId ? node.name : 'Choose a question set')}
        </button>
        .
      </p>
      {pickerOpen && data && trigger.current && (
        <QuestionSetPicker
          sets={data.sets}
          context={data}
          courseName={data.course?.name ?? 'Current course'}
          value={setId}
          host={trigger.current.closest<HTMLElement>('[data-path-editor-host]') ?? document.body}
          onChange={(id) => {
            setSetId(id);
            setError('');
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
      {data?.sets.length === 0 && (
        <p className="mt-3 text-sm text-ink-faint">
          Save a question set before adding it to the path.
        </p>
      )}
    </PathEditorSurface>
  );
}
