import { useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { InfoPopover } from '../../components/analytics/InfoPopover';
import { Button } from '../../components/ui/Button';
import { AlertIcon, LockIcon } from '../../components/ui/icons';
import { fieldLabelClassName } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { canEditLessons } from '../../course/lessonViewMode';
import { updateCourse } from '../../db/courseRepository';
import { db } from '../../db/schema';
import type { CourseRecord } from '@lacuna/core/db/types';
import type { SpecificationReference } from '@lacuna/core/specifications/links';
import { previewSpecificationSelection } from '../../specifications/selectionPreview';
import { papersForSelection } from '@lacuna/core/specifications/selection';

const qualifications = {
  gcse: 'GCSE',
  'international-gcse': 'International GCSE',
  'cambridge-igcse-9-1': 'Cambridge IGCSE (9–1)',
  fsmq: 'FSMQ',
};
const boards = {
  aqa: 'AQA',
  'pearson-edexcel': 'Pearson Edexcel',
  ocr: 'OCR',
  cambridge: 'Cambridge',
};

export function CourseSpecificationSection({ course }: { course: CourseRecord }) {
  const [draft, setDraft] = useState<SpecificationReference>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const initialSource = useRef('');
  const changeButton = useRef<HTMLButtonElement>(null);
  const tierId = useId();
  const spec = course.specificationData;
  const reference = course.specificationRef;
  const source = JSON.stringify([reference, spec]);
  const evidence = useLiveQuery(
    () =>
      db.transaction('r', [db.concepts, db.courseAssessments], async () => ({
        concepts: await db.concepts.where('courseId').equals(course.id).toArray(),
        assessments: await db.courseAssessments.where('courseId').equals(course.id).toArray(),
      })),
    [course.id],
  );

  if (!spec) {
    return (
      <p className="text-sm text-ink-soft">
        {reference
          ? `Specification ${reference.specificationId} has no supplied metadata. Tier, route and point coverage cannot be resolved.`
          : 'Custom course: no specification metadata supplied.'}{' '}
        Use the free-text details below, or import a course with specification metadata to choose
        tiers and routes.
      </p>
    );
  }

  const selected = draft ?? reference ?? { specificationId: spec.id };
  const preview = evidence
    ? previewSpecificationSelection(course, selected, evidence.concepts, evidence.assessments)
    : undefined;
  const changedElsewhere = draft !== undefined && initialSource.current !== source;
  const editable = canEditLessons(course);
  const unsupportedRoutes =
    selected.routeIds?.filter((id) => !spec.routes.some((route) => route.id === id)) ?? [];
  const unavailableTier = selected.tier && !spec.tiers.some((tier) => tier.id === selected.tier);
  const papers = papersForSelection(spec, selected);
  const hasChoices =
    spec.tiers.length > 0 ||
    spec.routes.length > 0 ||
    !!reference?.tier ||
    !!reference?.routeIds?.length;

  function close() {
    setDraft(undefined);
    setError('');
    requestAnimationFrame(() => changeButton.current?.focus());
  }

  async function save() {
    if (!draft || !preview || changedElsewhere || !editable || saving) return;
    setSaving(true);
    setError('');
    try {
      await updateCourse(course.id, { specificationRef: draft });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save specification selection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Supplied specification"
      className="flex flex-col gap-4"
      onKeyDown={(event) => {
        if (draft && event.key === 'Escape' && !saving) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{spec.title}</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {boards[spec.board]} · {qualifications[spec.qualification]} · {spec.code} · First exam{' '}
            {spec.firstExamination}
          </p>
        </div>
        <InfoPopover label="About this specification">
          <p>Edition: {spec.source.issue}.</p>
          <p className="break-words">Source: {spec.source.document}.</p>
          <p>Course-supplied metadata; coverage is not independently verified.</p>
        </InfoPopover>
      </div>
      {papers.length > 0 && (
        <ul aria-label="Available papers" className="flex flex-col gap-1.5 text-sm">
          {papers.map((paper) => (
            <li key={paper.id} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 rounded-lg bg-ink/[0.06] px-2 py-0.5 text-xs tabular text-ink-soft">
                {paper.ref}
              </span>
              <span className="min-w-0">{paper.title}</span>
            </li>
          ))}
        </ul>
      )}
      {!editable && (
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <LockIcon width={16} height={16} className="mt-0.5 shrink-0" />
          This published course is locked. The publisher owns its specification selection. Use the
          existing detach option below if you want to edit your own copy.
        </p>
      )}
      {draft ? (
        <fieldset disabled={saving || !editable} className="flex min-w-0 flex-col gap-4">
          <legend className="mb-3 font-medium">Choose tier and routes</legend>
          {(spec.tiers.length > 0 || unavailableTier) && (
            <label htmlFor={tierId} className={`${fieldLabelClassName} flex flex-col gap-2`}>
              Tier
              <Select
                id={tierId}
                className="w-full sm:max-w-sm"
                autoFocus
                value={selected.tier ?? ''}
                onChange={(event) =>
                  setDraft({ ...selected, tier: event.target.value || undefined })
                }
              >
                <option value="">{spec.tiers.length ? 'Choose a tier' : 'No tier required'}</option>
                {unavailableTier && (
                  <option value={selected.tier}>Unavailable tier: {selected.tier}</option>
                )}
                {spec.tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {(spec.routes.length > 0 || unsupportedRoutes.length > 0) && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Routes</legend>
              {[
                ...spec.routes,
                ...unsupportedRoutes.map((id) => ({ id, name: `Unavailable route: ${id}` })),
              ].map((route, index) => (
                <label key={route.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    autoFocus={spec.tiers.length === 0 && !unavailableTier && index === 0}
                    checked={selected.routeIds?.includes(route.id) ?? false}
                    onChange={(event) =>
                      setDraft({
                        ...selected,
                        routeIds: event.target.checked
                          ? [...(selected.routeIds ?? []), route.id]
                          : selected.routeIds?.filter((id) => id !== route.id),
                      })
                    }
                  />
                  {route.name}
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>
      ) : (
        hasChoices && (
          <div className="flex flex-wrap gap-2 text-xs text-ink-soft">
            {(spec.tiers.length > 0 || reference?.tier) && (
              <span className="rounded-lg bg-ink/[0.06] px-2 py-1">
                Tier ·{' '}
                {spec.tiers.find((tier) => tier.id === reference?.tier)?.name ??
                  (reference?.tier ? `Unavailable (${reference.tier})` : 'Not chosen')}
              </span>
            )}
            {(spec.routes.length > 0 || reference?.routeIds?.length) && (
              <span className="rounded-lg bg-ink/[0.06] px-2 py-1">
                Routes ·{' '}
                {reference?.routeIds?.length
                  ? reference.routeIds
                      .map(
                        (id) =>
                          spec.routes.find((route) => route.id === id)?.name ??
                          `Unavailable (${id})`,
                      )
                      .join(', ')
                  : 'Not chosen'}
              </span>
            )}
          </div>
        )
      )}
      <div
        role="region"
        aria-label="Selection consequences"
        aria-live="polite"
        className="flex flex-col gap-2 text-sm"
      >
        {!preview ? (
          <p>Loading point links and paper coverage…</p>
        ) : (
          <>
            {preview.selectionError && <p className="text-negative">{preview.selectionError}</p>}
            {preview.unavailableLinks.length > 0 && (
              <>
                <p className="flex items-center gap-2 text-warning">
                  <AlertIcon width={16} height={16} className="shrink-0" />
                  {preview.unavailableLinks.length} unsupported Concept point link
                  {preview.unavailableLinks.length === 1 ? '' : 's'}. All links are retained.
                </p>
                {draft && (
                  <ul className="max-h-48 list-disc overflow-auto pl-5 text-ink-soft">
                    {preview.unavailableLinks.map((link) => (
                      <li
                        key={`${link.conceptId}:${link.specificationPointId}`}
                        className="break-words"
                      >
                        {link.conceptName}: {link.specificationPointId} (
                        {link.reason.replaceAll('-', ' ')})
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {draft && preview.paperCoverage.length > 0 && (
              <ul className="list-disc pl-5">
                {preview.paperCoverage.map((paper) => (
                  <li key={paper.id}>
                    {paper.name}:{' '}
                    {paper.error
                      ? `Cannot save: ${paper.error}`
                      : `${paper.added.length} points added, ${paper.removed.length} removed from coverage.`}
                  </li>
                ))}
              </ul>
            )}
            {draft && (
              <p className="text-xs text-ink-faint">
                Cards, review history, lesson order and assessment definitions stay unchanged. Paper
                coverage follows the chosen tier and routes.
              </p>
            )}
          </>
        )}
      </div>
      {changedElsewhere && (
        <p role="alert" className="text-sm text-negative">
          The course specification changed while editing. Cancel and reopen to review the latest
          selection.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          ref={changeButton}
          size="sm"
          hidden={draft !== undefined || !hasChoices}
          disabled={!editable}
          onClick={() => {
            initialSource.current = source;
            setError('');
            setDraft({
              ...reference,
              specificationId: spec.id,
              tier: reference?.tier ?? (spec.tiers.length === 1 ? spec.tiers[0].id : undefined),
              routeIds: reference?.routeIds?.length
                ? reference.routeIds
                : spec.routes.length === 1
                  ? [spec.routes[0].id]
                  : [],
            });
          }}
        >
          Change selection
        </Button>
        {draft && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              disabled={
                saving ||
                !editable ||
                !preview ||
                changedElsewhere ||
                !!preview.selectionError ||
                preview.paperCoverage.some((paper) => paper.error)
              }
            >
              Save selection
            </Button>
            <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
