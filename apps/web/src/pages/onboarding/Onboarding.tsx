import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, CourseSchedulingMode } from '@lacuna/core/db/types';
import { StudyTargetTiles } from '../../components/course/CourseStudyTarget';
import { NewCourseForm } from '../../components/course/NewCourseForm';
import { ImportPanel } from '../../components/import/ImportPanel';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { Button } from '../../components/ui/Button';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useAnswerStrictness } from '../../state/answerStrictness';
import { useIsTouchMode } from '../../state/inputMode';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import {
  chooseStudyTarget,
  chosenStudyTarget,
  finishOnboarding,
} from '../../onboarding/onboardingState';
import { ArrowRightIcon, ChevronLeftIcon, PlusIcon, UploadIcon } from '../../components/ui/icons';
import { FlipCard } from '../learn/FlipCard';
import { LearnHeader } from '../learn/LearnHeader';
import { StudyCardTransition } from '../learn/StudyCardTransition';
import { StudyControls } from '../learn/StudyControls';
import type { Phase, SessionCardOutcome } from '../learn/types';
import '../learn/studyLayout.css';

// Built in rather than stored: trying it creates no course and no review history.
const FIRST_CARD: Card = {
  id: 'onboarding-first-card',
  conceptId: 'onboarding-first-card',
  deckId: 'onboarding',
  courseId: 'onboarding',
  schedulingUnitId: 'onboarding',
  type: 'front_back',
  front: 'How long does sunlight take to reach Earth?',
  back: 'About **8 minutes**.\n\nLight crosses the 150 million km in a little over 8 minutes, so the Sun you see is 8 minutes old.',
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [],
  tags: [],
  createdAt: 0,
  updatedAt: 0,
};

// The required steps lead straight into the chosen material.
const STEPS = ['card', 'exam', 'content'] as const;
type Step = (typeof STEPS)[number];
type ContentIntent = 'create' | 'import' | null;

const EXAM_WORDING: Record<CourseSchedulingMode, { label: string; detail: string }> = {
  exam: { label: 'Yes', detail: 'Reviews build up to the day' },
  steady: { label: 'Not yet', detail: 'Reviews keep everything fresh' },
};

const NO_FILTERS: never[] = [];
const noop = () => {};

export function Onboarding() {
  const navigate = useNavigate();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  const [params] = useSearchParams();
  // Existing creation and import flows return here only to finish their handover.
  const then = params.get('then');
  const [step, setStep] = useState<Step>('card');
  const [contentIntent, setContentIntent] = useState<ContentIntent>(null);
  const [initialTarget] = useState(chosenStudyTarget);
  const [target, setTarget] = useState<CourseSchedulingMode | null>(initialTarget?.mode ?? null);
  const [examDate, setExamDate] = useState(() => initialTarget?.examDate ?? defaultExamDate());
  const [examDateValid, setExamDateValid] = useState(true);
  // Only a course the learner has just made or imported; anything else goes to Today.
  const destination = then && /^\/course\/[^/?#]+(?:\/lesson\/[^/?#]+)?$/.test(then) ? then : '/';
  useLayoutEffect(() => {
    if (!then) return;
    finishOnboarding();
    void navigate(destination, { replace: true });
  }, [then, destination, navigate]);
  const stepIndex = STEPS.indexOf(step);
  const outcomes = new Map<string, SessionCardOutcome>(
    STEPS.slice(0, stepIndex).map((done) => [done, 'correct']),
  );

  // A course being imported must finish here, or its lineage confirmation is skipped.
  const [importing, setImporting] = useState(false);
  const leave = () => {
    if (importing && step === 'content') return;
    finishOnboarding();
    void navigate(destination, { replace: true });
  };
  const advance = () => setStep(STEPS[stepIndex + 1]);
  const back = () => {
    if (importing) return;
    if (step === 'content' && contentIntent) setContentIntent(null);
    else if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  return (
    <div className="study-session flex h-dvh flex-col overflow-hidden">
      <LearnHeader
        mode="simple"
        plannedRevision={false}
        revisionSecondsRemaining={0}
        revisionWindowBudgetSeconds={0}
        singleDeck={null}
        unitDisplayName="Lacuna"
        sessionProgress={stepIndex / STEPS.length}
        predictedRecall={0}
        sessionCardIds={[...STEPS]}
        sessionCardOutcomes={outcomes}
        filterParams={NO_FILTERS}
        tagFilter={null}
        onExit={() => leave()}
        focusMode={false}
        onToggleFocus={noop}
        onToggleFullscreen={noop}
        isFullscreen={false}
        onPointerLeave={noop}
        menuOpen={false}
        setMenuOpen={noop}
        current={null}
        isTouchMode={isTouchMode}
        onEdit={noop}
        onToggleFlag={noop}
        onBury={noop}
        onSuspend={noop}
        onShowShortcuts={noop}
        m={m}
        currentCardIds={[step]}
        cardActions={false}
        segmentNoun="Step"
      />
      <main
        className={
          'mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden ' +
          'pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] ' +
          'pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-6 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
        }
      >
        {stepIndex > 0 && (
          <div className="mb-3 flex shrink-0 items-center">
            <Button
              variant="secondary"
              aria-label="Back"
              title="Back"
              disabled={importing}
              onClick={back}
              className="h-11 w-11 shrink-0"
              style={{ paddingInline: 0 }}
            >
              <ChevronLeftIcon width={22} height={22} />
            </Button>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="flex min-h-0 flex-1 flex-col"
            initial={m > 0 ? { opacity: 0, x: 32 } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={m > 0 ? { opacity: 0, x: -32 } : undefined}
            transition={{ duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 'card' ? (
              <CardStep m={m} isTouchMode={isTouchMode} onDone={advance} />
            ) : step === 'exam' ? (
              <ExamStep
                target={target}
                setTarget={setTarget}
                examDate={examDate}
                setExamDate={setExamDate}
                examDateValid={examDateValid}
                setExamDateValid={setExamDateValid}
                onDone={advance}
              />
            ) : (
              <ContentStep
                intent={contentIntent}
                onIntent={setContentIntent}
                onBusyChange={setImporting}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Step 1 teaches an honest self-judgement without making recall a condition of setup. */
function CardStep({
  m,
  isTouchMode,
  onDone,
}: {
  m: number;
  isTouchMode: boolean;
  onDone: () => void;
}) {
  const [motionSpeed] = useMotionSpeed();
  const [answerStrictness] = useAnswerStrictness();
  const [phase, setPhase] = useState<Phase>('question');
  const [hasMissed, setHasMissed] = useState(false);
  const typingInputRef = useRef<HTMLInputElement>(null);

  const reveal = () => setPhase('answer');
  const hide = () => setPhase('question');
  const answer = (input: boolean | number) => {
    if (phase !== 'answer') return;
    if (input === true || (typeof input === 'number' && input > 1)) onDone();
    else {
      setHasMissed(true);
      hide();
    }
  };

  // Space shows the answer, as it does in a study session.
  useEffect(() => {
    if (phase !== 'question') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      if ((event.target as HTMLElement | null)?.closest('button, a, input, textarea')) return;
      event.preventDefault();
      reveal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  return (
    <>
      <div className="mb-4 shrink-0 text-center">
        <StepHeading compact>Practice</StepHeading>
      </div>
      <div className="study-card-slot min-h-0 flex-1">
        <StudyCardTransition cardId={FIRST_CARD.id} phase={phase} multiplier={m}>
          <FlipCard
            card={FIRST_CARD}
            revealed={phase === 'answer'}
            motionSpeed={motionSpeed}
            phase={phase}
            menuOpen={false}
            editing={false}
            hintsOpen={false}
            onReveal={reveal}
            onHide={hide}
            onAnswer={answer}
            mode="simple"
            answerStrictness={answerStrictness}
          />
        </StudyCardTransition>
      </div>
      {hasMissed && (
        <div className="mt-3 shrink-0 text-center">
          <Button variant="ghost" onClick={onDone}>
            Continue setup <ArrowRightIcon width={18} height={18} />
          </Button>
        </div>
      )}
      <StudyControls
        phase={phase}
        recallPrompt="Did you remember the answer?"
        isTypingCard={false}
        isTouchMode={isTouchMode}
        gradingMode="silent"
        typedAnswer=""
        typingInputRef={typingInputRef}
        onTypedAnswer={noop}
        onReveal={reveal}
        onAnswer={answer}
        m={m}
      />
    </>
  );
}

/** Step 2: the study target, asked as a plain question. Step 3 applies it to the new course. */
function ExamStep({
  target,
  setTarget,
  examDate,
  setExamDate,
  examDateValid,
  setExamDateValid,
  onDone,
}: {
  target: CourseSchedulingMode | null;
  setTarget: (mode: CourseSchedulingMode) => void;
  examDate: number;
  setExamDate: (date: number) => void;
  examDateValid: boolean;
  setExamDateValid: (valid: boolean) => void;
  onDone: () => void;
}) {
  const [timeZone] = useState(getLocalTimeZone);
  const ready = target === 'steady' || (target === 'exam' && examDateValid);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        chooseStudyTarget(target === 'exam' ? { mode: target, examDate } : { mode: 'steady' });
        onDone();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
        <fieldset className="mx-auto w-full max-w-md">
          <legend className="contents">
            <StepHeading>Do you have an exam coming up?</StepHeading>
          </legend>
          <StudyTargetTiles
            name="onboarding-exam"
            value={target}
            onChange={setTarget}
            wording={EXAM_WORDING}
          />
          <AnimatedDisclosure open={target === 'exam'}>
            <div className="pt-4">
              <DateTimePicker
                value={examDate}
                onChange={setExamDate}
                onValidityChange={setExamDateValid}
                timeZone={timeZone}
                label="Exam date and time"
              />
            </div>
          </AnimatedDisclosure>
        </fieldset>
      </div>
      <div className="study-controls mt-6 w-full shrink-0">
        <div className="mx-auto w-full max-w-md">
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!ready}>
            Continue
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Each step's question, focused on arrival so keyboard and screen-reader users start there. */
function StepHeading({ children, compact = false }: { children: string; compact?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className={
        'text-balance font-display tracking-tight text-ink outline-none focus-visible:shadow-none ' +
        (compact ? 'mb-2 text-xl' : 'mb-6 text-2xl md:text-3xl')
      }
    >
      {children}
    </h2>
  );
}

/**
 * Step 3: the real import surface, or a new empty course. Each of them finishes by opening
 * its course through the existing onboarding completion handover.
 */
function ContentStep({
  intent,
  onIntent,
  onBusyChange,
}: {
  intent: ContentIntent;
  onIntent: (intent: ContentIntent) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Top-aligned: the panel changes height as sources open and searches narrow. */}
      <div className="mx-auto w-full max-w-md py-2 md:pt-8">
        <StepHeading key={intent ?? 'choices'}>What do you want to learn?</StepHeading>
        {!intent ? (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => onIntent('create')}
              className="min-h-36 flex-col gap-4 px-3"
              style={{ borderRadius: '1.5rem' }}
            >
              <PlusIcon width={32} height={32} />
              Create my own
            </Button>
            <Button
              variant="secondary"
              onClick={() => onIntent('import')}
              className="min-h-36 flex-col gap-4 px-3"
              style={{ borderRadius: '1.5rem' }}
            >
              <UploadIcon width={32} height={32} />
              Import
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-surface-raised card-surface">
            {intent === 'create' ? (
              <NewCourseForm
                inline
                library={false}
                onClose={() => onIntent(null)}
                onBusyChange={onBusyChange}
              />
            ) : (
              <div className="pt-2">
                <ImportPanel onClose={() => onIntent(null)} onBusyChange={onBusyChange} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
