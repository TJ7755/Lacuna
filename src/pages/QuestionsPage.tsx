import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { CourseTabs } from '../components/course/CourseTabs';
import { BatchAuthoringPromptDialog } from '../components/items/BatchAuthoringPromptDialog';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import {
  ChevronLeftIcon,
  EditIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
} from '../components/ui/icons';
import { useCourse, useLessons } from '../state/useCourseData';

function dueLabel(due: number | null, now: number): string {
  if (due === null) return 'Not yet practised';
  if (due <= now) return 'Due now';
  return `Next due ${new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(due)}`;
}

export function QuestionsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [showBatchPrompt, setShowBatchPrompt] = useState(false);
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const data = useCourseQuestionData(courseId);
  const now = Date.now();
  const conceptNames = useMemo(
    () => new Map(data?.concepts.map((concept) => [concept.id, concept.name]) ?? []),
    [data?.concepts],
  );
  const sets = useMemo(
    () => new Map(data?.conceptSets.map((set) => [set.questionId, set]) ?? []),
    [data?.conceptSets],
  );
  const lessonNames = useMemo(
    () => new Map(lessons?.map((lesson) => [lesson.id, lesson.name]) ?? []),
    [lessons],
  );
  const dueCount = data?.questions.filter(
    (question) => !question.suspended && question.due !== null && question.due <= now,
  ).length;

  if (course === undefined || lessons === undefined || data === undefined) {
    return (
      <DelayedFallback>
        <QuestionsPageSkeleton />
      </DelayedFallback>
    );
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          All courses
        </Link>
        <CourseTabs courseId={course.id} />
      </div>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink-faint">
            Post-instruction practice
          </p>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Questions</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
            Apply what you have learnt in fixed problems and varied generated examples. Question
            results are kept separate from Card recall.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowBatchPrompt(true)}>
            <SparklesIcon width={18} height={18} />
            Build batch prompt
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(`/course/${course.id}/questions/new`)}
          >
            <PlusIcon width={18} height={18} />
            New Question
          </Button>
        </div>
      </header>

      {data.questions.length > 0 && (
        <section className="mb-8 grid gap-3 rounded-2xl border border-line bg-surface-raised p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate(`/course/${course.id}/questions/learn?mode=default&limit=10`)}
            className="group rounded-xl border border-accent/25 bg-accent-soft p-5 text-left transition hover:border-accent/50"
          >
            <span className="mb-5 grid size-10 place-items-center rounded-full bg-accent text-accent-fg">
              <PlayIcon width={17} height={17} />
            </span>
            <span className="block font-display text-xl text-ink">Practise 10</span>
            <span className="mt-1 block text-sm leading-5 text-ink-soft">
              Due Questions first, then unseen Questions, interleaved by target Concept.
            </span>
          </button>
          <button
            type="button"
            disabled={!dueCount}
            onClick={() => navigate(`/course/${course.id}/questions/learn?mode=all-due`)}
            className="rounded-xl border border-line-strong bg-surface p-5 text-left transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="mb-5 block font-mono text-3xl tabular-nums text-ink">
              {dueCount ?? 0}
            </span>
            <span className="block font-display text-xl text-ink">All due</span>
            <span className="mt-1 block text-sm leading-5 text-ink-soft">
              {dueCount ? 'Complete every Question currently due.' : 'Nothing is due right now.'}
            </span>
          </button>
        </section>
      )}

      {data.questions.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-display text-2xl text-ink">No Questions yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Start with one worked problem after teaching. Cards remain the place for short recall.
          </p>
          <Button
            className="mt-6"
            variant="primary"
            onClick={() => navigate(`/course/${course.id}/questions/new`)}
          >
            <PlusIcon width={18} height={18} />
            Create a Question
          </Button>
        </section>
      ) : (
        <section aria-label="Question definitions" className="space-y-3">
          {data.questions.map((question) => {
            const set = sets.get(question.id);
            const targetName = set?.targetConceptIds[0]
              ? conceptNames.get(set.targetConceptIds[0])
              : undefined;
            return (
              <article
                key={question.id}
                className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-line-strong px-2.5 py-1 text-ink-soft">
                      {question.kind === 'fixed' ? 'Fixed' : 'Generated family'}
                    </span>
                    {question.suspended && (
                      <span className="rounded-full bg-ink/5 px-2.5 py-1 text-ink-faint">
                        Suspended
                      </span>
                    )}
                    <span className="text-ink-faint">{dueLabel(question.due, now)}</span>
                  </div>
                  <h2 className="truncate font-display text-xl text-ink">{question.name}</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    {targetName
                      ? `Primary skill practised: ${targetName}`
                      : 'Target Concept missing'}
                    {question.primaryLessonId
                      ? ` · ${lessonNames.get(question.primaryLessonId) ?? 'Unknown lesson'}`
                      : ''}
                  </p>
                </div>
                <Link
                  to={`/course/${course.id}/questions/${question.id}/edit`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm text-ink-soft transition hover:border-accent/60 hover:text-accent"
                >
                  <EditIcon width={16} height={16} />
                  Edit
                </Link>
              </article>
            );
          })}
        </section>
      )}

      <AnimatePresence>
        {showBatchPrompt && (
          <BatchAuthoringPromptDialog
            courseId={course.id}
            courseName={course.name}
            examBoard={course.examBoard}
            specification={course.specification}
            lessons={lessons}
            questions={data.questions}
            onClose={() => setShowBatchPrompt(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuestionsPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <div className="mb-8 h-11 w-56 animate-pulse rounded-xl bg-ink/10" />
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-ink/10" />
        <div className="h-40 animate-pulse rounded-2xl bg-ink/10" />
      </div>
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-ink/10" />
        <div className="h-24 animate-pulse rounded-2xl bg-ink/10" />
      </div>
    </div>
  );
}
