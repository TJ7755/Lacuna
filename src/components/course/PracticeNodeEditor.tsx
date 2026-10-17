import { countOf } from '../../utils/plural';
import { useMemo, useRef, useState } from 'react';
import {
  createPracticeNode,
  updatePracticeNode,
  deletePracticeNode,
} from '../../db/practiceNodeRepository';
import type { Card, Lesson, LessonCardLink, PracticeNode } from '../../db/types';
import { lessonCardMembershipForLessons } from '../../course/studyPools';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { choiceChipClass } from '../ui/choiceChip';
import { inputFrameClassName } from '../ui/Field';
import { PathEditorSurface } from './PathEditorSurface';
import { PathEditorPopover } from './PathEditorPopover';
import { emptyPracticeNodeDraft, draftFromPracticeNode, parseCardCount } from './practiceNodeDraft';

export function PracticeNodeEditor({
  courseId,
  lessons,
  cards = [],
  links = [],
  node,
  defaultPosition,
  onSaved,
}: {
  courseId: string;
  lessons: Lesson[];
  cards?: Card[];
  links?: LessonCardLink[];
  node?: PracticeNode;
  defaultPosition?: number;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    node
      ? draftFromPracticeNode(node)
      : { ...emptyPracticeNodeDraft(defaultPosition), name: 'Card practice' },
  );
  const [choosingLessons, setChoosingLessons] = useState(!!draft.lessonIds?.length);
  const [error, setError] = useState('');
  const name = useRef<HTMLInputElement>(null);
  const count = useRef<HTMLInputElement>(null);
  const countTrigger = useRef<HTMLSpanElement>(null);
  const scope = useMemo(
    () =>
      lessonCardMembershipForLessons(
        new Set(draft.lessonIds ?? lessons.map((lesson) => lesson.id)),
        cards,
        links,
      ),
    [cards, lessons, draft.lessonIds, links],
  );
  async function save() {
    if (!draft.name.trim()) {
      setError('Enter a name.');
      name.current?.focus();
      return false;
    }
    if (
      draft.cardCount.trim() &&
      (!Number.isInteger(Number(draft.cardCount)) || Number(draft.cardCount) < 1)
    ) {
      setError('Enter a whole card limit of at least 1, or leave it empty.');
      (count.current ?? countTrigger.current?.querySelector('button'))?.focus();
      return false;
    }
    try {
      const options = {
        name: draft.name.trim(),
        position: draft.position,
        lessonIds: draft.lessonIds,
        cardCount: parseCardCount(draft.cardCount),
        randomize: draft.randomize,
      };
      if (node) await updatePracticeNode(node.id, options);
      else await createPracticeNode(courseId, { type: 'manual', ...options });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the practice node.');
      return false;
    }
  }
  async function remove() {
    if (!node) return false;
    try {
      await deletePracticeNode(node.id);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the practice node.');
      return false;
    }
  }
  return (
    <PathEditorSurface
      label={node ? 'Edit card practice' : 'Add card practice'}
      onSave={save}
      onClosed={onSaved}
      onDelete={node ? remove : undefined}
      deleteNoun="practice node"
    >
      <p className="path-editor-sentence">
        <input
          ref={name}
          data-path-editor-focus
          aria-label="Name"
          aria-invalid={(!draft.name.trim() && !!error) || undefined}
          className="path-editor-name"
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
            setError('');
          }}
        />{' '}
        practises{' '}
        <span ref={countTrigger}>
          <PathEditorPopover label={draft.cardCount ? `${draft.cardCount} cards` : 'all cards'}>
            <label className="block p-2 text-sm text-ink-soft">
              Card limit
              <input
                ref={count}
                type="number"
                min={1}
                step={1}
                placeholder="No limit"
                className={`mt-2 block w-full ${inputFrameClassName}`}
                value={draft.cardCount}
                onChange={(event) => setDraft({ ...draft, cardCount: event.target.value })}
              />
            </label>
          </PathEditorPopover>
        </span>{' '}
        from{' '}
        <PathEditorPopover
          label={
            draft.lessonIds?.length
              ? `${draft.lessonIds.length} chosen lesson${draft.lessonIds.length === 1 ? '' : 's'}`
              : 'all lessons'
          }
        >
          {(close) => (
            <>
              <button
                type="button"
                className="path-editor-option"
                onClick={() => {
                  setChoosingLessons(false);
                  setDraft({ ...draft, lessonIds: undefined });
                  close();
                }}
              >
                All lessons
              </button>
              <button
                type="button"
                className="path-editor-option"
                onClick={() => {
                  setChoosingLessons(true);
                  close();
                }}
              >
                Chosen lessons
              </button>
            </>
          )}
        </PathEditorPopover>
        , in{' '}
        <PathEditorPopover label={draft.randomize ? 'random' : 'lesson'}>
          {(close) => (
            <>
              {[false, true].map((randomize) => (
                <button
                  key={String(randomize)}
                  type="button"
                  className="path-editor-option"
                  aria-pressed={draft.randomize === randomize}
                  onClick={() => {
                    setDraft({ ...draft, randomize });
                    close();
                  }}
                >
                  {randomize ? 'Random' : 'Lesson'}
                </button>
              ))}
            </>
          )}
        </PathEditorPopover>{' '}
        order.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
      <AnimatedDisclosure open={choosingLessons}>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Covered lessons">
          {lessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              aria-pressed={draft.lessonIds?.includes(lesson.id) ?? false}
              className={choiceChipClass(draft.lessonIds?.includes(lesson.id) ?? false)}
              onClick={() => {
                const selected = draft.lessonIds ?? [];
                const lessonIds = selected.includes(lesson.id)
                  ? selected.filter((id) => id !== lesson.id)
                  : [...selected, lesson.id];
                setDraft({ ...draft, lessonIds: lessonIds.length ? lessonIds : undefined });
              }}
            >
              {lesson.name}
            </button>
          ))}
        </div>
      </AnimatedDisclosure>
      <p className="mt-3 text-sm text-ink-faint">
        {countOf(draft.lessonIds?.length ?? lessons.length, 'lesson')} ·{' '}
        {Math.min(parseCardCount(draft.cardCount) ?? scope.length, scope.length)} cards
      </p>
    </PathEditorSurface>
  );
}
