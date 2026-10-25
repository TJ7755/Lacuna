import { RelatedQuestionSets } from '../question-sets/RelatedQuestionSets';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { m as motion, useIsPresent } from 'motion/react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatDateTime } from '../../utils/datetime';
import { expandingActionSpring } from '../ui/motion';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';

interface AssessmentDetailSheetProps {
  assessment: CourseAssessment;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  onClose: () => void;
  onRevise: () => void;
}

export function assessmentSheetTiming(multiplier: number) {
  const ease = [0.16, 1, 0.3, 1] as const;
  return {
    backdrop: { duration: 0.16 * multiplier, ease },
    sheet: expandingActionSpring(multiplier),
  };
}

export function AssessmentDetailSheet({
  assessment,
  lessons,
  cards,
  links,
  onClose,
  onRevise,
}: AssessmentDetailSheetProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const transition = assessmentSheetTiming(multiplier);
  const present = useIsPresent();
  const trapRef = useFocusTrap(present);
  const resolved = resolveAssessmentCoverage(assessment, lessons, cards, links);
  const excludedNames = assessment.excludedCardIds.map(
    (id) => cards.find((card) => card.id === id)?.front ?? `Missing card: ${id}`,
  );

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex justify-end"
      inert={!present}
      aria-hidden={!present || undefined}
      initial={multiplier > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={multiplier > 0 ? { opacity: 0 } : undefined}
      transition={transition.backdrop}
      onKeyDown={(event) => {
        if (event.key === 'Tab') return;
        event.stopPropagation();
        if (event.key === 'Escape') onClose();
      }}
    >
      <ModalBackdrop shade={40} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${assessment.name} details`}
        initial={multiplier > 0 ? { x: 32 } : false}
        animate={{ x: 0 }}
        exit={multiplier > 0 ? { x: 32 } : undefined}
        transition={transition.sheet}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-line-strong bg-paper pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] card-surface"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 className="break-words font-display text-2xl">{assessment.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {assessment.kind === 'final' ? 'Final assessment' : 'Checkpoint'} ·{' '}
              {assessment.examDate === undefined
                ? 'steady retention'
                : formatDateTime(assessment.examDate, assessment.timeZone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assessment details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto break-words px-6 py-6">
          <section>
            <h3 className="text-sm font-medium text-ink">Coverage</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {resolved.coveredLessons.length} lesson
              {resolved.coveredLessons.length === 1 ? '' : 's'} · {resolved.cards.length} card
              {resolved.cards.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              {resolved.coveredLessons.map((lesson) => (
                <li key={lesson.id}>{lesson.name}</li>
              ))}
            </ul>
          </section>

          <RelatedQuestionSets
            courseId={assessment.courseId}
            assessmentId={assessment.id}
            onNavigate={onClose}
          />

          {excludedNames.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-ink">Exclusions</h3>
              <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                {excludedNames.map((name, index) => (
                  <li key={`${assessment.excludedCardIds[index]}-${index}`}>{name}</li>
                ))}
              </ul>
            </section>
          )}

          {!(resolved.validation.valid && !resolved.validation.needsAuthorConfirmation) && (
            <section>
              <h3 className="text-sm font-medium text-ink">Needs author review</h3>
              {resolved.validation.issues.map((issue) => (
                <p
                  key={`${issue.code}-${issue.referenceId ?? ''}`}
                  className="mt-1 text-sm text-negative"
                >
                  {issue.message}
                </p>
              ))}
            </section>
          )}
        </div>

        <footer className="border-t border-line px-6 py-4">
          <Button
            variant="primary"
            onClick={onRevise}
            aria-label={`Revise for ${assessment.name}`}
            className="w-full"
          >
            Revise
          </Button>
        </footer>
      </motion.aside>
    </motion.div>
  );
}
