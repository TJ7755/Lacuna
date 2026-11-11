import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type { Card, CourseAssessment } from '@lacuna/core/db/types';

/** The authored scope remains visible when only the assessment date is editable. */
export function AssessmentCoverageDetails({
  assessment,
  cards,
  resolved,
}: {
  assessment: CourseAssessment;
  cards: Card[];
  resolved: ReturnType<typeof resolveAssessmentCoverage>;
}) {
  const excludedNames = assessment.excludedCardIds.map(
    (id) => cards.find((card) => card.id === id)?.front ?? `Missing card: ${id}`,
  );
  return (
    <div className="mt-4 space-y-4 text-sm text-ink-soft">
      <p>
        {resolved.coveredLessons.length} lesson{resolved.coveredLessons.length === 1 ? '' : 's'},{' '}
        {resolved.cards.length} card{resolved.cards.length === 1 ? '' : 's'}
      </p>
      <ul className="space-y-1">
        {resolved.coveredLessons.map((lesson) => (
          <li key={lesson.id}>{lesson.name}</li>
        ))}
      </ul>
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
  );
}
