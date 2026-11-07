import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filterSessionCardPool } from '@lacuna/core/db/search';
import type { resolveLearnSessionRequest } from '../../course/learnSessionRequest';
import { StudyEntrance } from '../../components/learn/StudyEntrance';
import { StudyExitHeader } from '../../components/learn/StudyExitHeader';
import { QuestionSetChoices } from '../../components/question-sets/QuestionSetChoices';
import '../../components/question-sets/question-set-controls.css';
import { Button } from '../../components/ui/Button';
import { PageLoading } from '../../components/ui/PageLoadingBoundary';
import { useLeaveFlowWith } from '../../utils/editorOrigin';
import { loadSessionSource } from './loadSessionSource';
import { filterSimpleLearnCardPool } from './sessionPool';
import {
  buildSimpleLearnQuestions,
  retrySimpleLearnQuestion,
  type SimpleLearnQuestion,
} from './simpleLearnQuestions';

type ChoiceSessionLoad =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; exitTo: string; questions: SimpleLearnQuestion[] };

export function SimpleLearnChoiceSession({
  options,
}: {
  options: ReturnType<typeof resolveLearnSessionRequest>;
}) {
  const navigate = useNavigate();
  const [load, setLoad] = useState<ChoiceSessionLoad>({ state: 'loading' });
  const exit = useLeaveFlowWith(navigate, load.state === 'ready' ? load.exitTo : '/');

  useEffect(() => {
    let cancelled = false;
    void loadSessionSource(options)
      .then((source) => {
        if (cancelled) return;
        if ('redirect' in source) {
          void navigate(source.redirect, { replace: true });
          return;
        }
        const { tagFilter, filterParams, courseId, lessonId } = options;
        const cards = filterSimpleLearnCardPool(
          filterSessionCardPool(source.cards, { tag: tagFilter, filters: filterParams }),
        );
        const exitTo = lessonId
          ? `/course/${source.resolvedCourseId}/lesson/${lessonId}`
          : `/course/${courseId}`;
        setLoad({
          state: 'ready',
          exitTo,
          questions: buildSimpleLearnQuestions(cards, Boolean(lessonId)),
        });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, options]);

  return (
    <StudyEntrance className="flex min-h-dvh flex-col bg-paper">
      <StudyExitHeader onExit={exit} />
      {load.state === 'loading' ? (
        <PageLoading />
      ) : load.state === 'failed' ? (
        <ChoiceSessionMessage title="Could not load questions" />
      ) : load.questions.length === 0 ? (
        <ChoiceSessionMessage
          title="No multiple-choice questions"
          detail="Choose a lesson with at least two cards with short, distinct answers."
        />
      ) : (
        <ChoicePractice questions={load.questions} onDone={exit} />
      )}
    </StudyEntrance>
  );
}

const mainClass =
  'mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 pb-16 pt-8';

function ChoiceSessionMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className={mainClass}>
      <h1 className="font-display text-3xl tracking-tight md:text-4xl">{title}</h1>
      {detail && <p className="text-ink-soft">{detail}</p>}
    </main>
  );
}

/** Recognition attempts stay in this queue and never enter the scheduled recall workflow. */
function ChoicePractice({
  questions,
  onDone,
}: {
  questions: SimpleLearnQuestion[];
  onDone: () => void;
}) {
  const [queue, setQueue] = useState(questions);
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = queue[0];
  const correct = selected === question?.answer;

  useEffect(() => {
    heading.current?.focus();
  }, [question]);

  return (
    <main className={mainClass} aria-label="Multiple choice">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-3xl tracking-tight outline-none md:text-4xl"
      >
        {question?.prompt ?? 'All questions answered correctly'}
      </h1>
      {question ? (
        <>
          <QuestionSetChoices
            label="Choose an answer"
            value={selected}
            options={question.choices.map((choice) => ({ value: choice, label: choice }))}
            onChange={setSelected}
            disabled={checked}
            flow
            accentValues={() => checked && correct}
          />
          <p role="status" className="min-h-6 text-sm">
            {checked &&
              (correct ? (
                <span className="text-positive">Correct.</span>
              ) : (
                <span className="text-negative">Incorrect. Correct answer: {question.answer}</span>
              ))}
          </p>
          <div>
            <Button
              variant="primary"
              size="lg"
              disabled={!selected}
              onClick={() => {
                if (!checked) {
                  setChecked(true);
                  return;
                }
                const remaining = queue.slice(1);
                if (!correct) remaining.push(retrySimpleLearnQuestion(question));
                setQueue(remaining);
                setSelected('');
                setChecked(false);
              }}
            >
              {checked ? 'Continue' : 'Check answer'}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="primary" size="lg" onClick={onDone}>
            Done
          </Button>
        </div>
      )}
    </main>
  );
}
