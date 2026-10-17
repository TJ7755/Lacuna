import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSetPracticeNode } from '../../db/types';
import {
  createQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
  deleteQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import { QuestionSetChoices } from '../question-sets/QuestionSetChoices';
import { PathEditorSurface } from './PathEditorSurface';
import { PathEditorPopover } from './PathEditorPopover';
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
      db.transaction('r', [db.questionSets, db.lessons], async () => ({
        sets: await db.questionSets.where('courseId').equals(courseId).toArray(),
        lessons: (await db.lessons.where('courseId').equals(courseId).toArray()).sort(
          (a, b) => a.orderIndex - b.orderIndex,
        ),
      })),
    [courseId],
  );
  const [setId, setSetId] = useState(node?.questionSetId ?? '');
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
      if (node) await updateQuestionSetPracticeNode(node.id, anchor);
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
      onDelete={node ? remove : undefined}
      deleteNoun="question-set activity"
    >
      <p ref={sentence} data-morph-row className="path-editor-sentence">
        Practise{' '}
        {node ? (
          <input
            aria-label="Question set"
            data-path-editor-focus
            className="path-editor-name"
            readOnly
            value={title ?? node.name}
          />
        ) : (
          <PathEditorPopover initialFocus label={title ?? 'Choose a question set'}>
            {(close) => (
              <QuestionSetChoices
                label="Question set"
                value={setId}
                onChange={(id) => {
                  setSetId(id);
                  setError('');
                  close();
                }}
                options={data?.sets.map((set) => ({ value: set.id, label: set.title })) ?? []}
              />
            )}
          </PathEditorPopover>
        )}
        .
      </p>
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
