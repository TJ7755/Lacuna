import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PillToggleGroup } from '../components/cards/PillToggleGroup';
import { QuestionSetAttemptList } from '../components/question-sets/QuestionSetAttemptList';
import { QuestionSetEvidencePanel } from '../components/question-sets/QuestionSetEvidencePanel';
import { questionSetReturn } from '../questions/questionSetNavigation';
import { Button, buttonClassName } from '../components/ui/Button';
import { ArrowRightIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { StepSwap } from '../components/ui/StepSwap';
import {
  QuestionSetLoading,
  QuestionSetUnavailable,
} from '../components/question-sets/QuestionSetRouteState';
import {
  listQuestionSetAttempts,
  startQuestionSetAttempt,
} from '../questions/questionSetAttemptRepository';
import type { QuestionSetAttemptMode } from '../questions/questionSetAttempts';
import { AppLink as Link } from '../components/ui/AppLink';
import { getQuestionSet } from '../questions/questionSetRepository';
import { flattenQuestionSet } from '../questions/questionSetAuthoring';
import { questionSetMarks, nodeMarks } from '../components/question-sets/presentation';
import { useCourse } from '../state/useCourseData';
import { canEditLessons, resolveLessonViewMode } from '../course/lessonViewMode';
import { MarkdownView } from '../components/markdown/MarkdownView';
import '../components/question-sets/question-sets.css';
import '../components/question-sets/question-composer.css';

const MODE_OPTIONS = [
  { value: 'practice', label: 'Practice', description: 'Feedback after each question' },
  { value: 'paper', label: 'Paper', description: 'Feedback at the end' },
] as const;

export function QuestionSetOverview() {
  const { courseId, setId } = useParams<{ courseId: string; setId: string }>();
  const origin = questionSetReturn(useLocation().state, courseId!);
  const course = useCourse(courseId);
  const navigate = useNavigate();
  const [mode, setMode] = useState<QuestionSetAttemptMode>('practice');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const attempts = useLiveQuery(() => listQuestionSetAttempts(setId!), [setId]);
  const content = useLiveQuery(() => getQuestionSet(setId!), [setId]);
  if (content === undefined || !course || !attempts) return <QuestionSetLoading />;
  const retainedAttempts = attempts.filter((attempt) => attempt.courseId === courseId);
  const back = (
    <Link className="qs-back" to={origin?.questionSetReturnTo ?? `/course/${courseId}/questions`}>
      ← {origin?.questionSetReturnLabel ?? 'Question sets'}
    </Link>
  );
  if (!content && retainedAttempts.length)
    return (
      <div className="qs-editor qs-composer">
        {back}
        <header className="qs-composer-header">
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {retainedAttempts[0].receipt.title}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              This set was removed. Your saved attempts and their original questions are still
              available below.
            </p>
          </div>
        </header>
        <SectionCard className="px-5 pb-6 pt-6 md:px-7 md:pt-7" aria-labelledby="attempts-heading">
          <h2 id="attempts-heading" className="mb-3.5 font-display text-[22px]">
            Attempts
          </h2>
          <QuestionSetAttemptList attempts={retainedAttempts} origin={origin} />
        </SectionCard>
      </div>
    );
  if (!content || content.courseId !== courseId)
    return (
      <QuestionSetUnavailable
        title="Question set not found"
        backTo={origin?.questionSetReturnTo ?? `/course/${courseId}/questions`}
      >
        It may have been removed or belong to another course. Return to Questions to choose a set.
      </QuestionSetUnavailable>
    );
  const unfinished = retainedAttempts
    .filter((attempt) => attempt.status !== 'complete')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const marks = questionSetMarks(content);
  const openAttempt = (id: string) =>
    navigate(`/course/${courseId}/question-sets/${setId}/attempts/${id}`, { state: origin });
  return (
    <div className="qs-editor qs-composer">
      {back}
      <header className="qs-composer-header">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold tracking-tight">{content.title}</h1>
          <p className="mt-2 text-sm text-ink-faint">
            {content.questions.length} {content.questions.length === 1 ? 'question' : 'questions'} ·{' '}
            {marks} {marks === 1 ? 'mark' : 'marks'}
          </p>
        </div>
        {canEditLessons(course) && resolveLessonViewMode(course) === 'edit' && !course.archived && (
          <Link
            className={buttonClassName('ghost', 'md')}
            state={origin}
            to={`/course/${courseId}/question-sets/${setId}/edit`}
          >
            Edit
          </Link>
        )}
      </header>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {unfinished ? (
            <p className="text-sm text-ink-soft">
              {unfinished.mode === 'paper'
                ? 'Paper attempt · Feedback at the end'
                : 'Practice attempt · Feedback after each question'}
            </p>
          ) : (
            <>
              <PillToggleGroup
                label="Attempt mode"
                size="sm"
                options={MODE_OPTIONS}
                value={mode}
                onChange={setMode}
              />
              <StepSwap stepKey={mode}>
                <p className="text-sm text-ink-soft">
                  {MODE_OPTIONS.find((option) => option.value === mode)!.description}
                </p>
              </StepSwap>
            </>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          hoverScale={false}
          disabled={starting || course.archived}
          onClick={() => {
            if (unfinished) {
              void openAttempt(unfinished.id);
              return;
            }
            setStarting(true);
            setError('');
            void startQuestionSetAttempt(setId!, mode)
              .then((attempt) => openAttempt(attempt.id))
              .catch((cause) => {
                setError(cause instanceof Error ? cause.message : 'Could not start this attempt.');
                setStarting(false);
              });
          }}
        >
          {unfinished ? 'Resume' : starting ? 'Starting…' : 'Start'}
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-6">
          <SectionCard
            className="min-w-0 px-5 pb-3 pt-6 md:px-7 md:pt-7"
            aria-labelledby="questions-heading"
          >
            <h2 id="questions-heading" className="mb-2 font-display text-[22px]">
              Questions
            </h2>
            <ol className="m-0 list-none p-0">
              {flattenQuestionSet(content).map((row) => {
                const marks = nodeMarks(row.node);
                return (
                  <li
                    key={row.id}
                    className="flex min-w-0 items-center gap-3 px-0 py-3.5"
                    style={{ marginLeft: row.depth * 20 }}
                  >
                    <span
                      className={
                        row.depth === 0
                          ? 'w-9 shrink-0 text-center text-sm font-semibold text-ink-soft tabular-nums'
                          : 'w-9 shrink-0 text-center text-sm text-ink-soft'
                      }
                    >
                      {row.label}
                    </span>
                    <MarkdownView
                      source={row.node.prompt}
                      className={`qs-question-line min-w-0 flex-1 ${row.depth ? 'text-sm' : 'font-medium'}`}
                    />
                    <span className="shrink-0 whitespace-nowrap text-sm text-ink-faint tabular-nums">
                      {marks} {marks === 1 ? 'mark' : 'marks'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </div>
        {retainedAttempts.length > 0 && (
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <SectionCard
              className="flex flex-col gap-3.5 px-5 pb-6 pt-6 md:px-7 md:pt-7"
              aria-labelledby="attempts-heading"
            >
              <h2 id="attempts-heading" className="font-display text-[22px]">
                Attempts
              </h2>
              <QuestionSetAttemptList attempts={retainedAttempts} origin={origin} />
              <QuestionSetEvidencePanel content={content} attempts={retainedAttempts} />
            </SectionCard>
          </aside>
        )}
      </div>
    </div>
  );
}
