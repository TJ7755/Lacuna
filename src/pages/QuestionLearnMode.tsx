import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QuestionSessionHeader } from '../components/questions/QuestionSessionHeader';
import { QuestionFeedback } from '../components/questions/QuestionFeedback';
import {
  QuestionResponsePanel,
  type CheckedQuestionAnswer,
} from '../components/questions/QuestionResponsePanel';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
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
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { useCourse } from '../state/useCourseData';
import { MOTION_EASING } from '../components/ui/motion';
import { ResultMark } from '../components/questions/ResultMark';

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
  // Bumped when the learner asks for fresh numbers; part of the attempt id and generator seed.
  const [rerollCount, setRerollCount] = useState(0);
  const activeAttemptRef = useRef<QuestionAttempt | null>(null);
  const abandonedAttemptIds = useRef(new Set<string>());
  const abandonWrites = useRef(new Map<string, Promise<void>>());
  const answerWriteRef = useRef<Promise<void> | null>(null);
  const [busy, setBusy] = useState(false);
  const exitGuardRef = useRef<NavigationGuardHandle>(null);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  const abandonAttemptOnce = useCallback(async (candidate: QuestionAttempt | null) => {
    if (candidate?.status !== 'shown' || abandonedAttemptIds.current.has(candidate.id)) return;
    const pending = abandonWrites.current.get(candidate.id);
    if (pending) return pending;
    const write = abandonQuestionAttempt(candidate.id)
      .then(() => {
        abandonedAttemptIds.current.add(candidate.id);
        if (activeAttemptRef.current?.id === candidate.id) activeAttemptRef.current = null;
      })
      .finally(() => {
        abandonWrites.current.delete(candidate.id);
      });
    abandonWrites.current.set(candidate.id, write);
    return write;
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
              seed: `${sessionId}:${index}:${question.id}${rerollCount ? `:r${rerollCount}` : ''}`,
            })
          : undefined;
      return startQuestionAttempt({
        questionId: question.id,
        sessionId,
        attemptId: `${sessionId}:${index}${rerollCount ? `:r${rerollCount}` : ''}`,
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
  }, [abandonAttemptOnce, attempt, index, question, questionIds, rerollCount, sessionId, startVersion]);

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

  const reroll = async () => {
    if (!attempt || attempt.status !== 'shown' || busy) return;
    setBusy(true);
    try {
      await abandonAttemptOnce(attempt);
      setAttempt(null);
      setRerollCount((count) => count + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not draw new numbers.', 'negative');
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
        <motion.section
          initial={multiplier > 0 ? { opacity: 0, y: 14, scale: 0.98 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.46 * multiplier, ease: MOTION_EASING.emphasised }}
          className="flex w-full max-w-lg flex-col items-center rounded-[28px] bg-surface px-7 py-12 text-center shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]"
        >
          {questionIds.length > 0 && <ResultMark tone="right" className="mb-5 size-12" />}
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            {questionIds.length ? 'Session complete' : 'No Questions to practise'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {questionIds.length
              ? `${answeredCount} ${answeredCount === 1 ? 'Question' : 'Questions'} completed.`
              : 'There are no eligible Questions in this selection.'}
          </p>
          <Button
            className="mt-7 min-h-14 px-7 font-bold"
            variant="primary"
            onClick={() => navigate(`/course/${course.id}/questions`)}
          >
            Back to Questions
          </Button>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 pb-12 text-ink md:px-8">
      <SessionExitGuard
        ref={exitGuardRef}
        active={() => activeAttemptRef.current?.status === 'shown'}
        itemName="Question"
        answeredCount={answeredCount}
        totalCount={uniqueQuestionCount}
        onConfirm={settleAnswerAndAbandon}
        onExplicitLeave={() => navigate(`/course/${courseId}/questions`)}
      />
      <div className="mx-auto max-w-[1000px]">
        <QuestionSessionHeader
          completed={answeredCount}
          total={uniqueQuestionCount}
          onExit={exit}
        />

        {startError ? (
          <section
            role="alert"
            className="grid min-h-[24rem] place-items-center rounded-[28px] bg-surface px-6 py-12 text-center shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]"
          >
            <div className="max-w-md">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
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
          <div className="h-[24rem] animate-pulse rounded-[28px] bg-ink/10" />
        ) : (
          <motion.div
            key={`${attempt.id}:${attempt.status}`}
            initial={multiplier > 0 ? { opacity: 0, y: 14, scale: 0.985 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4 * multiplier, ease: MOTION_EASING.emphasised }}
          >
            {attempt.status === 'answered' ? (
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
              <QuestionResponsePanel
                attempt={attempt}
                onSubmit={(answer) => void submit(answer)}
                onReroll={question?.kind === 'generated' ? () => void reroll() : undefined}
              />
            )}
          </motion.div>
        )}
      </div>
    </main>
  );
}

function QuestionSessionSkeleton() {
  return (
    <main className="min-h-screen bg-paper px-4 py-7 md:px-8">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 h-11 w-full animate-pulse rounded-xl bg-ink/10" />
        <div className="h-[24rem] animate-pulse rounded-[28px] bg-ink/10" />
      </div>
    </main>
  );
}
