import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, CourseSchedulingMode } from '../../db/types';
import { StudyTargetTiles } from '../../components/course/CourseStudyTarget';
import { NewCourseForm } from '../../components/course/NewCourseForm';
import { ImportPanel } from '../../components/import/ImportPanel';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { Button } from '../../components/ui/Button';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useAdvancedDetails } from '../../state/advancedDetails';
import { PillSwitch, SettingsCard } from '../settings/SettingsUi';
import { useAnswerStrictness } from '../../state/answerStrictness';
import { useIsTouchMode } from '../../state/inputMode';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import { chooseStudyTarget, finishOnboarding } from '../../onboarding/onboardingState';
import { AppearanceSection } from '../settings/AppearanceSection';
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

// The four steps from #816, shown as the session bar's segments.
const STEPS = ['card', 'exam', 'content', 'features'] as const;
type Step = (typeof STEPS)[number];

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
  // Set once the learner has a course: every flow that makes one returns here for the last step.
  const then = params.get('then');
  const [step, setStep] = useState<Step>(then ? 'features' : 'card');
  // Only a course the learner has just made or imported; anything else goes to Today.
  const destination = then && /^\/course\/[^/?#]+(?:\/lesson\/[^/?#]+)?$/.test(then) ? then : '/';
  // Step 3 hands over by navigating here again, which keeps this page mounted. Going back from
  // the last step loses the course, so it returns to step 3.
  useEffect(() => {
    if (then) setStep('features');
    else setStep((current) => (current === 'features' ? 'content' : current));
  }, [then]);
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
          'pt-4 md:pt-6 ' +
          (isTouchMode && step === 'card'
            ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]'
            : 'pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6')
        }
      >
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
              <ExamStep onDone={advance} />
            ) : step === 'content' ? (
              <ContentStep onBusyChange={setImporting} />
            ) : (
              <FeaturesStep onDone={leave} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Step 1: one card in the real study frame. A missed card comes back until it is known. */
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
  const typingInputRef = useRef<HTMLInputElement>(null);

  const reveal = () => setPhase('answer');
  const hide = () => setPhase('question');
  const answer = (input: boolean | number) => {
    if (phase !== 'answer') return;
    if (input === true || (typeof input === 'number' && input > 1)) onDone();
    else hide();
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
      <div className="study-card-slot min-h-0 flex-1">
        <StudyCardTransition cardId={FIRST_CARD.id} phase={phase} multiplier={m}>
          <FlipCard
            card={FIRST_CARD}
            revealed={phase === 'answer'}
            motionSpeed={motionSpeed}
            phase={phase}
            isTouchMode={isTouchMode}
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
      <StudyControls
        phase={phase}
        isTypingCard={false}
        isTouchMode={isTouchMode}
        gradingMode="silent"
        typedAnswer=""
        typingInputRef={typingInputRef}
        onTypedAnswer={noop}
        onReveal={reveal}
        onHide={hide}
        onAnswer={answer}
        m={m}
      />
    </>
  );
}

/** Step 2: the study target, asked as a plain question. Step 3 applies it to the new course. */
function ExamStep({ onDone }: { onDone: () => void }) {
  const [target, setTarget] = useState<CourseSchedulingMode | null>(null);
  const [timeZone] = useState(getLocalTimeZone);
  const [examDate, setExamDate] = useState(defaultExamDate);
  const [examDateValid, setExamDateValid] = useState(true);
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
function StepHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className="mb-6 text-balance font-display text-2xl tracking-tight text-ink outline-none focus-visible:shadow-none md:text-3xl"
    >
      {children}
    </h2>
  );
}

/**
 * Step 3: the real import surface, or a new empty course. Each of them finishes by opening
 * its course, which onboardingDestination routes back here for the last step first.
 */
function ContentStep({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [fromScratch, setFromScratch] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Top-aligned: the panel changes height as sources open and searches narrow. */}
      <div className="mx-auto w-full max-w-md py-2 md:pt-8">
        <StepHeading>What do you want to learn?</StepHeading>
        <div className="overflow-hidden rounded-3xl bg-surface-raised card-surface">
          {fromScratch ? (
            <NewCourseForm inline library={false} onClose={() => setFromScratch(false)} />
          ) : (
            <div className="pt-2">
              <ImportPanel onBusyChange={onBusyChange} />
            </div>
          )}
        </div>
        {!fromScratch && (
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" onClick={() => setFromScratch(true)}>
              Start from scratch
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Step 4: the real Appearance settings, so Lacuna looks right before the first session. */
function FeaturesStep({ onDone }: { onDone: () => void }) {
  const [showAdvancedDetails, setShowAdvancedDetails] = useAdvancedDetails();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto my-auto w-full max-w-xl py-2">
          <StepHeading>How should Lacuna look?</StepHeading>
          <AppearanceSection />
          <SettingsCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor="onboarding-advanced-details" className="font-semibold text-ink">
                  Show advanced details
                </label>
                <p className="mt-1 text-sm text-ink-soft">
                  Show scheduler settings and technical statistics. You can change this in Settings.
                </p>
              </div>
              <PillSwitch
                id="onboarding-advanced-details"
                checked={showAdvancedDetails}
                onChange={setShowAdvancedDetails}
                ariaLabel="Show advanced details"
              />
            </div>
          </SettingsCard>
        </div>
      </div>
      <div className="study-controls mt-6 w-full shrink-0">
        <div className="mx-auto w-full max-w-md">
          <Button variant="primary" size="lg" className="w-full" onClick={onDone}>
            Open course
          </Button>
        </div>
      </div>
    </div>
  );
}
