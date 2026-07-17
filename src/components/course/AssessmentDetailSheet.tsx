import { m as motion } from 'motion/react';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { formatDateTime } from '../../utils/datetime';
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

export function AssessmentDetailSheet({
  assessment,
  lessons,
  cards,
  links,
  onClose,
  onRevise,
}: AssessmentDetailSheetProps) {
  const trapRef = useFocusTrap(true);
  const resolved = resolveAssessmentCoverage(assessment, lessons, cards, links);
  const excludedNames = assessment.excludedCardIds.map(
    (id) => cards.find((card) => card.id === id)?.front ?? `Missing card: ${id}`,
  );

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${assessment.name} details`}
        initial={{ x: 32 }}
        animate={{ x: 0 }}
        exit={{ x: 32 }}
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-line-strong bg-paper shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">Checkpoint</p>
            <h2 className="mt-1 font-display text-2xl">{assessment.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {formatDateTime(assessment.examDate, assessment.timeZone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assessment details"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
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

          <section>
            <h3 className="text-sm font-medium text-ink">Exclusions</h3>
            {excludedNames.length ? (
              <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                {excludedNames.map((name, index) => (
                  <li key={`${assessment.excludedCardIds[index]}-${index}`}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-faint">None</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium text-ink">Validation</h3>
            <p
              className={
                'mt-1 text-sm ' +
                (resolved.validation.valid && !resolved.validation.needsAuthorConfirmation
                  ? 'text-positive'
                  : 'text-negative')
              }
            >
              {resolved.validation.valid && !resolved.validation.needsAuthorConfirmation
                ? 'Scope is valid'
                : 'Needs author review'}
            </p>
            {resolved.validation.issues.map((issue) => (
              <p key={`${issue.code}-${issue.referenceId ?? ''}`} className="mt-1 text-xs text-negative">
                {issue.message}
              </p>
            ))}
          </section>
        </div>

        <footer className="border-t border-line px-6 py-4">
          <Button variant="primary" onClick={onRevise} className="w-full">
            Revise for this assessment
          </Button>
        </footer>
      </motion.aside>
    </motion.div>
  );
}
