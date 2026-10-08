import { Skeleton } from '../components/ui/Skeleton';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { BatchAuthoringPromptDialog } from '../components/items/BatchAuthoringPromptDialog';
import { QuestionBankCard } from '../components/questions/QuestionBankCard';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SparklesIcon } from '../components/ui/icons';
import { MOTION_EASING } from '../components/ui/motion';
import { summariseQuestion } from '../questions/bankSummary';
import { selectQuestionSession } from '../questions/selection';
import type { QuestionDefinition } from '../questions/types';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { useCourse, useLessons } from '../state/useCourseData';

const OUTLINE_PILL =
  'min-h-12 border-[1.5px] border-ink bg-transparent text-ink hover:border-ink hover:bg-ink/[0.04]';

function endOfToday(now: number): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function dueState(due: number | null, now: number): { label: string; today: boolean } {
  if (due === null) return { label: 'Not yet practised', today: false };
  if (due <= endOfToday(now)) return { label: 'Due today', today: true };
  return {
    label: `Due ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(due)}`,
    today: false,
  };
}

/** The first line of a fixed prompt as plain text, for the card's one-line description. */
function promptSnippet(question: QuestionDefinition): string | null {
  if (question.kind !== 'fixed') return null;
  const line = question.prompt
    .split(/\r?\n/)
    .map((part) => part.replace(/[*_`#>$]/g, '').trim())
    .find(Boolean);
  return line ?? null;
}

export function LegacyQuestionsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [showBatchPrompt, setShowBatchPrompt] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
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
  const sessionSize = useMemo(
    () =>
      data
        ? selectQuestionSession(data.questions, data.conceptSets, data.attempts, {
            mode: 'default',
            limit: 10,
          }).length
        : 0,
    [data],
  );

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
          Back to Today
        </Link>
      </div>
    );
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-10`}>
      <Link
        to={`/course/${course.id}/questions`}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Question sets
      </Link>
      <motion.header
        initial={multiplier > 0 ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.46 * multiplier, ease: MOTION_EASING.emphasised }}
        className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-4"
      >
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Individual questions
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setShowBatchPrompt(true)}>
            <SparklesIcon width={18} height={18} />
            Build batch prompt
          </Button>
          {data.questions.length > 0 && (
            <Button
              variant="secondary"
              disabled={!dueCount}
              className={OUTLINE_PILL}
              onClick={() => navigate(`/course/${course.id}/questions/learn?mode=all-due`)}
            >
              All due{dueCount ? ` (${dueCount})` : ''}
            </Button>
          )}
          {/* An empty bank offers its own Create a Question. */}
          {data.questions.length > 0 && (
            <Button
              variant="secondary"
              className={OUTLINE_PILL}
              onClick={() => navigate(`/course/${course.id}/questions/new`)}
            >
              <PlusIcon width={16} height={16} />
              New question
            </Button>
          )}
          {data.questions.length > 0 && (
            <Button
              variant="primary"
              size="lg"
              className="min-h-12 px-6 font-bold"
              disabled={sessionSize === 0}
              onClick={() => navigate(`/course/${course.id}/questions/learn?mode=default&limit=10`)}
            >
              Practise {sessionSize}
              <ChevronRightIcon width={16} height={16} />
            </Button>
          )}
        </div>
      </motion.header>

      {data.questions.length === 0 ? (
        <section className="rounded-3xl bg-surface px-6 py-16 text-center shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]">
          <p className="font-display text-2xl font-semibold tracking-tight text-ink">
            No Questions yet
          </p>
          <Button
            className="mt-6 min-h-12 px-6"
            variant="primary"
            onClick={() => navigate(`/course/${course.id}/questions/new`)}
          >
            <PlusIcon width={18} height={18} />
            Create a Question
          </Button>
        </section>
      ) : (
        <section aria-label="Question definitions" className="grid gap-4 md:grid-cols-2">
          {data.questions.map((question, index) => {
            const set = sets.get(question.id);
            const targetName = set?.targetConceptIds[0]
              ? conceptNames.get(set.targetConceptIds[0])
              : undefined;
            const lessonName = question.primaryLessonId
              ? lessonNames.get(question.primaryLessonId)
              : undefined;
            const due = question.suspended
              ? { label: 'Suspended', today: false }
              : dueState(question.due, now);
            return (
              <QuestionBankCard
                key={question.id}
                name={question.name}
                topic={lessonName ?? targetName ?? 'No lesson'}
                description={
                  targetName ? (promptSnippet(question) ?? targetName) : 'Target Concept missing'
                }
                descriptionWarning={!targetName}
                due={due}
                summary={summariseQuestion(question, data.attempts)}
                editHref={`/course/${course.id}/questions/${question.id}/edit`}
                index={index}
                multiplier={multiplier}
              />
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
    <div className={`${COURSE_PAGE_FRAME} pb-10 pt-6 md:pt-8`}>
      <Skeleton className="mb-6 h-11 w-56 rounded-xl bg-ink/10" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-3xl bg-ink/10" />
        <Skeleton className="h-40 rounded-3xl bg-ink/10" />
      </div>
    </div>
  );
}
