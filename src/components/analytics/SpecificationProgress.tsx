import { useId, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CourseProgressInput } from '../../course/courseProgress';
import {
  buildSpecificationProgress,
  type SpecificationPointProgress,
  type SpecificationProgressFilter,
} from '../../course/specificationProgress';
import type { ConceptPracticeItem } from '../../questions/conceptPractice';
import { papersForSelection } from '../../specifications/selection';
import { progressHeading } from '../../fsrs/objective';
import { originFrom } from '../../utils/editorOrigin';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { Select } from '../ui/Select';

function Point({
  point,
  forecastLabel,
  onPractise,
  evidenceLoading,
}: {
  point: SpecificationPointProgress;
  forecastLabel: string;
  onPractise: (pointId: string) => void;
  evidenceLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="min-w-0 border-t border-line">
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="cursor-pointer rounded-lg py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span className="font-medium">
            {point.ref} {point.title}
          </span>
          <span className="mt-1 block pl-4 text-xs text-ink-soft">
            {!point.concepts.length
              ? 'No linked content'
              : !point.hasContent
                ? 'Linked Concepts; no practice content'
                : `${point.study.reviewed} of ${point.countedCards} cards reviewed · ${point.study.taughtNotReviewed} taught, not reviewed`}
            {point.forecast !== null &&
              ` · ${Math.round(point.forecast * 100)}% ${forecastLabel.toLowerCase()}`}
          </span>
        </summary>
        {expanded && (
          <div className="min-w-0 space-y-3 pb-4 pl-4">
            {point.concepts.length > 0 && point.children.length === 0 && (
              <>
                <p className="text-xs text-ink-soft">
                  {point.contentCards} linked cards; {point.countedCards} included in recall.
                  {point.excludedCards > 0 &&
                    ` ${point.excludedCards} extension, suspended or buried cards excluded.`}{' '}
                  {point.study.notStarted} included cards neither reviewed nor recorded as taught.
                </p>
                <ul aria-label={`Concepts for ${point.ref}`} className="space-y-1 text-sm">
                  {point.concepts.map((concept) => (
                    <li key={concept.id}>{concept.name}</li>
                  ))}
                </ul>
                {evidenceLoading ? (
                  <p className="text-xs text-ink-soft">Loading Question evidence…</p>
                ) : point.evidence.rows.length ? (
                  <ul
                    aria-label={`Question evidence for ${point.ref}`}
                    className="space-y-1 text-xs text-ink-soft"
                  >
                    {point.evidence.rows.map((row) => (
                      <li key={row.id}>
                        {row.name}: {row.demonstrated} secure answers, {row.gaps} gap answers;{' '}
                        {row.topicsWithGap} topics to work on.
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-soft">
                    No independent diagnostic evidence yet. This is not evidence of a gap.
                  </p>
                )}
                {point.canPractise && (
                  <Button size="sm" onClick={() => onPractise(point.id)}>
                    Practise {point.ref}
                  </Button>
                )}
              </>
            )}
            {point.children.length > 0 && point.canPractise && (
              <Button size="sm" onClick={() => onPractise(point.id)}>
                Practise {point.ref}
              </Button>
            )}
            {point.children.length > 0 && (
              <ul aria-label={`Points within ${point.ref}`}>
                {point.children.map((child) => (
                  <Point
                    key={child.id}
                    point={child}
                    forecastLabel={forecastLabel}
                    onPractise={onPractise}
                    evidenceLoading={evidenceLoading}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </details>
    </li>
  );
}

/** The supplied tree stays secondary to the existing assessment overview and next action. */
export function SpecificationProgress({
  input,
  practice,
}: {
  input: CourseProgressInput;
  practice: readonly ConceptPracticeItem[] | undefined;
}) {
  const titleId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<SpecificationProgressFilter>({});
  const selection = useMemo(
    () => ({ ...input.course.specificationRef, ...filter }),
    [input.course.specificationRef, filter],
  );
  const report = useMemo(
    () => buildSpecificationProgress(input, selection, practice),
    [input, selection, practice],
  );
  const onPractise = (pointId: string) => {
    const params = new URLSearchParams({ specificationPoint: pointId });
    if (input.assessmentId) params.set('assessmentId', input.assessmentId);
    void navigate(`/course/${input.course.id}/study?${params}`, {
      state: originFrom(location, 'Back to Progress'),
    });
  };
  return (
    <SectionCard aria-labelledby={titleId} className="min-w-0 space-y-4">
      <h2 id={titleId} className="font-display text-2xl">
        Specification coverage
      </h2>
      {report.kind !== 'ready' ? (
        <p className="text-sm text-ink-soft">
          {report.kind === 'missing'
            ? 'This course has no supplied specification tree. You can still study and use Progress.'
            : 'The specification reference cannot be resolved from this course. Coverage is unknown; your study records are retained.'}
        </p>
      ) : (
        <>
          <div className="space-y-1 text-sm">
            <p>{report.specification.title}</p>
            <p className="text-ink-soft">
              {report.coveredPoints} of {report.totalPoints} supplied leaf points have linked
              practice content in this scope. This measures content coverage, not learning or exam
              readiness.
            </p>
            {/^https?:\/\//i.test(report.specification.source.url) ? (
              <a
                className="text-xs underline"
                href={report.specification.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {report.specification.source.document}, {report.specification.source.issue}
              </a>
            ) : (
              <p className="text-xs text-ink-soft">
                {report.specification.source.document}, {report.specification.source.issue}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {report.specification.tiers.length > 0 && (
              <label className="min-w-0 text-sm">
                Tier
                <Select
                  className="mt-1 w-full"
                  value={selection.tier ?? ''}
                  onChange={(event) =>
                    setFilter((old) => ({
                      ...old,
                      tier: event.target.value || undefined,
                      paperId: undefined,
                    }))
                  }
                >
                  <option value="">Unrestricted points</option>
                  {report.specification.tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {report.specification.routes.length > 0 && (
              <label className="min-w-0 text-sm">
                Route
                <Select
                  className="mt-1 w-full"
                  value={selection.routeIds?.length === 1 ? selection.routeIds[0] : ''}
                  onChange={(event) =>
                    setFilter((old) => ({
                      ...old,
                      routeIds: event.target.value
                        ? [event.target.value]
                        : input.course.specificationRef?.routeIds,
                      paperId: undefined,
                    }))
                  }
                >
                  <option value="">Course routes</option>
                  {report.specification.routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="min-w-0 text-sm">
              Paper
              <Select
                className="mt-1 w-full"
                value={filter.paperId ?? ''}
                onChange={(event) =>
                  setFilter((old) => ({ ...old, paperId: event.target.value || undefined }))
                }
              >
                <option value="">All applicable papers</option>
                {papersForSelection(report.specification, selection).map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.ref}: {paper.title}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            Filters only change this view. Use Show above to choose an assessment for practice.
            Practice uses your course selection. Parent totals count each Concept and card once,
            even when points overlap. Recall uses the overview’s dates and exclusions; taught at
            school does not mean remembered.
          </p>
          {report.roots.length ? (
            <ul aria-label="Specification points">
              {report.roots.map((point) => (
                <Point
                  key={point.id}
                  point={point}
                  forecastLabel={progressHeading(input.course)}
                  onPractise={onPractise}
                  evidenceLoading={practice === undefined}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">
              No supplied points match these filters and the selected assessment.
            </p>
          )}
          <p className="text-xs text-ink-soft">
            Question knowledge, application and technique counts stay separate from recall. Assisted
            answers, corrections, disputes and uncertain diagnoses are excluded; limited independent
            evidence does not establish exam readiness.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer py-2">
              Author coverage: {report.unmappedConcepts.length} unmapped Concepts;{' '}
              {report.unresolvedLinks.length} unresolved links
            </summary>
            <p className="my-2 text-xs text-ink-soft">
              Course-wide author checks. Unmapped or unresolved content is not proof that a supplied
              point has no content.
            </p>
            <ul className="space-y-1 break-words text-xs text-ink-soft">
              {report.unresolvedLinks.map(({ concept, pointId }) => (
                <li key={`${concept.id}:${pointId}`}>
                  {concept.name}: unresolved {pointId}
                </li>
              ))}
              {report.unmappedConcepts.map((concept) => (
                <li key={concept.id}>{concept.name}: no specification links</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </SectionCard>
  );
}
