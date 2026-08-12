import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { StudyFlowDecision, StudyFlowStep } from '../../course/studyFlowPlanner';
import { Button } from '../ui/Button';

/**
 * Whether the entry screen has an actual decision to put to the learner: more than one
 * way into the course, rather than a single action plus an exit.
 *
 * The study flow uses this to skip the screen entirely when there is nothing to choose,
 * so that the screen's appearance always means something needs choosing rather than
 * being a gate tapped through on the way to every session. It lives here, beside the
 * buttons it describes, so the two cannot drift apart.
 */
export function entryHasChoice(
  decision: StudyFlowDecision,
  recurringPracticeEligibleCount: number,
): boolean {
  const nextStep = decision.kind === 'step' || decision.kind === 'choice' ? decision.step : null;
  // With no next step the screen shows an explanatory message, which is not a choice but
  // must still be seen.
  if (!nextStep) return true;
  const assessments = decision.kind === 'choice' ? decision.assessments : [];
  const nextIsDueReview = nextStep.kind === 'practice' && nextStep.mode === 'recurring';
  const canReviewDueCards = recurringPracticeEligibleCount > 0 && !nextIsDueReview;
  return assessments.length > 0 || canReviewDueCards;
}

export function StudyEntry({
  courseName,
  decision,
  recurringPracticeEligibleCount,
  timeZone,
  onContinue,
  onReviewDueCards,
  onAssessment,
  onExit,
}: {
  courseName: string;
  decision: StudyFlowDecision;
  recurringPracticeEligibleCount: number;
  timeZone?: string;
  onContinue: (step: StudyFlowStep) => void;
  onReviewDueCards: () => void;
  onAssessment: (assessment: AssessmentPracticeOption) => void;
  onExit: () => void;
}) {
  const nextStep = decision.kind === 'step' || decision.kind === 'choice' ? decision.step : null;
  const assessments = decision.kind === 'choice' ? decision.assessments : [];
  const nextIsDueReview = nextStep?.kind === 'practice' && nextStep.mode === 'recurring';
  const canReviewDueCards = recurringPracticeEligibleCount > 0 && !nextIsDueReview;

  if (!nextStep) {
    return (
      <StudyFlowMessage
        title={
          decision.kind === 'empty'
            ? 'This course is empty'
            : decision.kind === 'blocked'
              ? 'Nothing is available yet'
              : 'You are caught up'
        }
        detail={
          decision.kind === 'empty'
            ? 'Add a lesson before starting this study flow.'
            : decision.kind === 'blocked'
              ? decision.reason === 'archived'
                ? 'This course is archived.'
                : 'The next lesson is still locked.'
              : 'There is no lesson or Practice work ready right now.'
        }
        onExit={onExit}
      />
    );
  }

  const primaryLabel = nextIsDueReview
    ? 'Review due cards'
    : nextStep.kind === 'lesson' && !canReviewDueCards
      ? `Start: ${nextStep.label}`
      : `Continue: ${nextStep.label}`;

  return (
    <div className="min-h-screen bg-paper px-6 py-10">
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">{courseName}</p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Choose what to study</h1>
        <p className="mt-4 text-ink-soft">
          Continue through the course or choose focused review when it is useful.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => (nextIsDueReview ? onReviewDueCards() : onContinue(nextStep))}
          >
            {primaryLabel}
          </Button>
          {canReviewDueCards && (
            <Button variant="secondary" size="lg" onClick={onReviewDueCards}>
              Review due cards
              <span className="ml-2 text-sm opacity-70">{recurringPracticeEligibleCount}</span>
            </Button>
          )}
          {assessments.map((assessment) => (
            <Button
              key={assessment.assessmentId}
              variant="secondary"
              size="lg"
              onClick={() => onAssessment(assessment)}
            >
              Revise for {assessment.name}
              <span className="ml-2 text-sm opacity-70">
                {new Intl.DateTimeFormat('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone,
                }).format(assessment.examDate)}
              </span>
            </Button>
          ))}
          <Button variant="ghost" size="lg" onClick={onExit}>
            Done
          </Button>
        </div>
      </main>
    </div>
  );
}

export function StudyFlowMessage({
  title,
  detail,
  onExit,
}: {
  title: string;
  detail: string;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-paper px-6 py-10">
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">Course study</p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 text-ink-soft">{detail}</p>
        <div className="mt-8">
          <Button variant="primary" size="lg" onClick={onExit}>
            Done
          </Button>
        </div>
      </main>
    </div>
  );
}
