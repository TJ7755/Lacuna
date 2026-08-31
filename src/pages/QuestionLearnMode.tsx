import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QuestionFeedback } from '../components/questions/QuestionFeedback';
import {
  QuestionResponsePanel,
  type CheckedQuestionAnswer,
} from '../components/questions/QuestionResponsePanel';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { ChevronLeftIcon } from '../components/ui/icons';
import { SessionExitGuard } from '../components/learn/SessionExitGuard';
import type { NavigationGuardHandle } from '../components/ui/NavigationGuard';
import { makeId } from '../db/schema';
import { questionGeneratorRegistry } from '../questions/generators';
import {
  abandonQuestionAttempt,
  answerQuestionAttempt,
  recordQuestionCorrection,
  startQuestionAttempt,
  undoQuestionAttempt,
} from '../questions/repository';
import { selectQuestionSession } from '../questions/selection';
import type { QuestionAttempt } from '../questions/types';
import { useCourse } from '../state/useCourseData';

export function QuestionLearnMode() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const course = useCourse(courseId);
  const data = useCourseQuestionData(courseId);
  const sessionId = useRef(`question-session:${makeId()}`).current;
  const [questionIds, setQuestionIds] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<QuestionAttempt | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startVersion, setStartVersion] = useState(0);
  const activeAttemptRef = useRef<QuestionAttempt | null>(null);
  const abandonedAttemptIds = useRef(new Set<string>());
  const answerWriteRef = useRef<Promise<void> | null>(null);
  const [busy, setBusy] = useState(false);
  const exitGuardRef = useRef<NavigationGuardHandle>(null);

  const abandonAttemptOnce = useCallback(async (candidate: QuestionAttempt | null) => {
    if (candidate?.status !== 'shown' || abandonedAttemptIds.current.has(candidate.id)) return;
    abandonedAttemptIds.current.add(candidate.id);
    if (activeAttemptRef.current?.id === candidate.id) activeAttemptRef.current = null;
    await abandonQuestionAttempt(candidate.id);
  }, []);

  const settleAnswerAndAbandon = useCallback(async () => {
    await answerWriteRef.current;
    await abandonAttemptOnce(activeAttemptRef.current);
  }, [abandonAttemptOnce]);

  useEffect(() => {
    activeAttemptRef.current = attempt;
  }, [attempt]);

  useEffect(() => {
    const abandonActivePresentation = () => {
      void settleAnswerAndAbandon().catch(() => undefined);
    };
    window.addEventListener('pagehide', abandonActivePresentation);
    return () => {
      window.removeEventListener('pagehide', abandonActivePresentation);
      abandonActivePresentation();
    };
  }, [settleAnswerAndAbandon]);

  useEffect(() => {
    if (!data || questionIds !== null) return;
    const mode = searchParams.get('mode') === 'all-due' ? 'all-due' : 'default';
    const requestedLimit = Number(searchParams.get('limit') ?? 10);
    setQuestionIds(
      selectQuestionSession(data.questions, data.conceptSets, data.attempts, {
        mode,
        limit: Number.isFinite(requestedLimit) ? requestedLimit : 10,
      }).map((question) => question.id),
    );
  }, [data, questionIds, searchParams]);

  const question = useMemo(() => {
    const id = questionIds?.[index];
    return id ? data?.questions.find((candidate) => candidate.id === id) : undefined;
  }, [data?.questions, index, questionIds]);

  useEffect(() => {
    if (!question || !questionIds || index >= questionIds.length) return;
    if (attempt?.questionId === question.id) return;
    let cancelled = false;
    setAttempt(null);
    setStartError(null);
    // Resolution and attempt startup share one async path so a synchronous throw
    // from the generator registry lands in the same recovery flow as a rejected
    // attempt write, and the Retry and Exit controls render for either failure.
    const start = async () => {
      const instance =
        question.kind === 'generated'
          ? questionGeneratorRegistry.resolve({
              generatorKey: question.generatorKey,
              generatorVersion: question.generatorVersion,
              configuration: question.generatorConfig,
              seed: `${sessionId}:${index}:${question.id}`,
            })
          : undefined;
      return startQuestionAttempt({
        questionId: question.id,
        sessionId,
        attemptId: `${sessionId}:${index}`,
        instance,
      });
    };
    void start()
      .then((started) => {
        if (!cancelled) {
          setAttempt(started);
          setStartError(null);
        } else {
          void abandonAttemptOnce(started).catch(() => undefined);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStartError(error instanceof Error ? error.message : 'Could not start this Question.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [abandonAttemptOnce, attempt, index, question, questionIds, sessionId, startVersion]);

  const submit = (answer: CheckedQuestionAnswer) => {
    if (!attempt || answerWriteRef.current) return;
    const attemptId = attempt.id;
    setBusy(true);
    const write = (async () => {
      try {
        const result = await answerQuestionAttempt({
          attemptId,
          submittedAnswer: answer.submittedAnswer,
          marksEarned: answer.marksEarned,
          marksAvailable: answer.marksAvailable,
          lineVerdicts: answer.lineVerdicts,
          checkerDisputes: answer.checkerDisputes,
          responseTimeSeconds: answer.responseTimeSeconds,
        });
        activeAttemptRef.current = result.attempt;
        setAttempt(result.attempt);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not record the answer.', 'negative');
      } finally {
        answerWriteRef.current = null;
        setBusy(false);
      }
    })();
    answerWriteRef.current = write;
  };

  const correct = async (correction: Parameters<typeof recordQuestionCorrection>[0]) => {
    if (!attempt) return;
    setBusy(true);
    try {
      const updated = await recordQuestionCorrection({ ...correction, attemptId: attempt.id });
      setAttempt(updated);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not record the correction.',
        'negative',
      );
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!attempt) return;
    setBusy(true);
    try {
      const result = await undoQuestionAttempt(attempt.id);
      setAttempt(result.attempt);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not undo scheduling.', 'negative');
    } finally {
      setBusy(false);
    }
  };

  const exit = () => exitGuardRef.current?.requestLeave();

  if (course === undefined || data === undefined || questionIds === null) {
    return <QuestionSessionSkeleton />;
  }
  if (course === null) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-soft">Course not found.</div>
    );
  }

  const finished = index >= questionIds.length;
  const answeredCount = new Set(
    questionIds.slice(0, index + (attempt?.status === 'answered' ? 1 : 0)),
  ).size;
  const uniqueQuestionCount = new Set(questionIds).size;
  if (finished || questionIds.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
        <section className="w-full max-w-lg rounded-3xl border border-line bg-surface px-7 py-12 text-center shadow-xl shadow-black/5">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">Question practice</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight">
            {questionIds.length ? 'Session complete' : 'No Questions to practise'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {questionIds.length
              ? `${answeredCount} ${answeredCount === 1 ? 'Question' : 'Questions'} completed.`
              : 'There are no eligible Questions in this selection.'}
          </p>
          <Button
            className="mt-7"
            variant="primary"
            onClick={() => navigate(`/course/${course.id}/questions`)}
          >
            Back to Questions
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-5 text-ink md:px-8 md:py-7">
      <SessionExitGuard
        ref={exitGuardRef}
        active={() => activeAttemptRef.current?.status === 'shown'}
        itemName="Question"
        answeredCount={answeredCount}
        totalCount={uniqueQuestionCount}
        onConfirm={settleAnswerAndAbandon}
        onExplicitLeave={() => navigate(`/course/${courseId}/questions`)}
      />
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={exit}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink"
          >
            <ChevronLeftIcon width={16} height={16} />
            Exit
          </button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-faint">{course.name}</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-ink-soft">
              {Math.min(answeredCount + 1, uniqueQuestionCount)} / {uniqueQuestionCount}
            </p>
          </div>
        </header>
        <div className="mb-6 h-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{
              width: `${(answeredCount / uniqueQuestionCount) * 100}%`,
            }}
          />
        </div>

        {startError ? (
          <section
            role="alert"
            className="grid min-h-[30rem] place-items-center rounded-3xl border border-line bg-surface px-6 py-12 text-center shadow-xl shadow-black/5"
          >
            <div className="max-w-md">
              <p className="text-xs uppercase tracking-[0.18em] text-negative">
                Question unavailable
              </p>
              <h1 className="mt-3 font-display text-3xl tracking-tight">
                Could not start practice
              </h1>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{startError}</p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={exit}>
                  Exit
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setStartError(null);
                    setStartVersion((version) => version + 1);
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          </section>
        ) : !attempt ? (
          <div className="h-[30rem] animate-pulse rounded-3xl bg-ink/10" />
        ) : attempt.status === 'answered' ? (
          <QuestionFeedback
            attempt={attempt}
            busy={busy}
            onCorrection={(answer) => void correct({ ...answer, attemptId: attempt.id })}
            onUndo={() => void undo()}
            onNext={() => {
              setAttempt(null);
              setIndex((current) => current + 1);
            }}
          />
        ) : (
          <QuestionResponsePanel attempt={attempt} onSubmit={(answer) => void submit(answer)} />
        )}
      </div>
    </main>
  );
}

function QuestionSessionSkeleton() {
  return (
    <main className="min-h-screen bg-paper px-4 py-7">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 h-11 w-full animate-pulse rounded-xl bg-ink/10" />
        <div className="h-[30rem] animate-pulse rounded-3xl bg-ink/10" />
      </div>
    </main>
  );
}
