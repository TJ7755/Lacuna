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
import { cn } from '../ui/cn';
import {
  AlertIcon,
  BookIcon,
  CardsIcon,
  CheckIcon,
  FileTextIcon,
  FilterIcon,
  FolderIcon,
  InfoIcon,
  PlayIcon,
} from '../ui/icons';
import { MiniRing } from '../ui/MiniRing';
import { SectionCard } from '../ui/SectionCard';
import { Select } from '../ui/Select';

type Status = 'unlinked' | 'linked' | 'new' | 'taught' | 'started' | 'reviewed';

const STATUS_LABEL: Record<Status, string> = {
  unlinked: 'No linked content',
  linked: 'Linked Concepts; no practice content',
  new: 'Not started',
  taught: 'Taught, not reviewed',
  started: 'Partly reviewed',
  reviewed: 'Every card reviewed',
};

/** A point's state from its own counts; recall stays a separate measure. */
function statusOf(point: SpecificationPointProgress): Status {
  if (!point.concepts.length) return 'unlinked';
  if (!point.hasContent) return 'linked';
  const { reviewed, taughtNotReviewed } = point.study;
  if (point.countedCards > 0 && reviewed === point.countedCards) return 'reviewed';
  if (reviewed) return 'started';
  return taughtNotReviewed ? 'taught' : 'new';
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function StatusIcon({ status }: { status: Status }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className="grid size-4 shrink-0 place-items-center"
    >
      {status === 'reviewed' ? (
        <span className="grid size-4 place-items-center rounded-full bg-accent text-accent-fg">
          <CheckIcon width={11} height={11} strokeWidth={2.4} />
        </span>
      ) : status === 'taught' ? (
        <BookIcon width={16} height={16} className="text-accent/70" />
      ) : (
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="hsl(var(--line-strong))"
            strokeWidth="1.6"
            strokeDasharray={status === 'unlinked' || status === 'linked' ? '2 2' : undefined}
          />
          {status === 'started' && <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="hsl(var(--accent))" />}
        </svg>
      )}
    </span>
  );
}

function CardsBar({ point }: { point: SpecificationPointProgress }) {
  if (!point.countedCards) return <span className="hidden w-[5.375rem] shrink-0 sm:block" />;
  const total = Math.max(1, point.countedCards);
  const label = `${point.study.reviewed} of ${point.countedCards} cards reviewed; ${point.study.taughtNotReviewed} taught, not reviewed`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="hidden shrink-0 items-center gap-1.5 text-ink-soft sm:flex"
    >
      <CardsIcon width={14} height={14} />
      <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span className="bg-accent" style={{ width: `${(point.study.reviewed / total) * 100}%` }} />
        <span
          className="bg-accent/35"
          style={{ width: `${(point.study.taughtNotReviewed / total) * 100}%` }}
        />
      </span>
    </span>
  );
}

function Recall({ point, label }: { point: SpecificationPointProgress; label: string }) {
  if (point.forecast === null) return <span className="size-5 shrink-0" />;
  const name = `${percent(point.forecast)} ${label.toLowerCase()}`;
  return (
    <span role="img" aria-label={name} title={name} className="grid shrink-0">
      <MiniRing value={point.forecast} size={20} />
    </span>
  );
}

function EvidenceIcon({ point, loading }: { point: SpecificationPointProgress; loading: boolean }) {
  if (loading || !point.hasContent) return <span className="size-4 shrink-0" />;
  const gaps = point.evidence.rows.reduce((sum, row) => sum + row.gaps, 0);
  const secure = point.evidence.rows.reduce((sum, row) => sum + row.demonstrated, 0);
  const label =
    !gaps && !secure
      ? 'No question evidence yet'
      : `Questions: ${secure} secure answers, ${gaps} gap answers`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-4 shrink-0 place-items-center',
        gaps ? 'text-warning' : 'text-accent',
      )}
    >
      {gaps ? (
        <AlertIcon width={16} height={16} />
      ) : secure ? (
        <FileTextIcon width={16} height={16} />
      ) : (
        <span className="size-1 rounded-full bg-line-strong" />
      )}
    </span>
  );
}

function PractiseButton({
  point,
  onPractise,
}: {
  point: SpecificationPointProgress;
  onPractise: (pointId: string) => void;
}) {
  if (!point.canPractise) return <span className="size-9 shrink-0" />;
  return (
    <button
      type="button"
      aria-label={`Practise ${point.ref}`}
      title={`Practise ${point.ref}`}
      onClick={() => onPractise(point.id)}
      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-accent hover:text-accent-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PlayIcon width={14} height={14} />
    </button>
  );
}

function PointRow({
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
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const evidence = point.evidence.rows.filter((row) => row.demonstrated || row.gaps);
  return (
    <li className="min-w-0">
      <div className="flex min-h-11 items-center gap-3 rounded-xl px-1 hover:bg-ink/5">
        <StatusIcon status={statusOf(point)} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          disabled={!point.concepts.length}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default"
        >
          <span className="w-11 shrink-0 tabular-nums text-ink-soft">{point.ref}</span>
          <span className="line-clamp-2 sm:truncate">{point.title}</span>
        </button>
        <CardsBar point={point} />
        <Recall point={point} label={forecastLabel} />
        <EvidenceIcon point={point} loading={evidenceLoading} />
        <PractiseButton point={point} onPractise={onPractise} />
      </div>
      {open && (
        <div id={detailId} className="space-y-2 pb-3 pl-[4.75rem] pr-1">
          <ul aria-label={`Concepts for ${point.ref}`} className="flex flex-wrap gap-1.5">
            {point.concepts.map((concept) => (
              <li key={concept.id} className="rounded-full border border-line px-2.5 py-1 text-xs">
                {concept.name}
              </li>
            ))}
          </ul>
          {evidence.length > 0 && (
            <ul aria-label={`Question evidence for ${point.ref}`} className="flex flex-wrap gap-3">
              {evidence.map((row) => (
                <li key={row.id} className="flex items-center gap-1.5 text-xs text-ink-soft">
                  {row.name}
                  <span
                    className="inline-flex items-center gap-0.5 text-accent"
                    title="Secure answers"
                  >
                    <CheckIcon width={12} height={12} aria-hidden="true" />
                    <span className="sr-only">secure</span>
                    {row.demonstrated}
                  </span>
                  <span
                    className="inline-flex items-center gap-0.5 text-warning"
                    title="Gap answers"
                  >
                    <AlertIcon width={12} height={12} aria-hidden="true" />
                    <span className="sr-only">gaps</span>
                    {row.gaps}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface Group {
  path: SpecificationPointProgress[];
  points: SpecificationPointProgress[];
}

/** Leaves under their nearest parent; single-child parents fold into one breadcrumb. */
function groupsOf(roots: SpecificationPointProgress[]): Group[] {
  const groups: Group[] = [];
  const walk = (node: SpecificationPointProgress, path: SpecificationPointProgress[]) => {
    const next = [...path, node];
    if (node.children.length === 1 && node.children[0].children.length) {
      walk(node.children[0], next);
      return;
    }
    const leaves = node.children.filter((child) => !child.children.length);
    if (leaves.length) groups.push({ path: next, points: leaves });
    for (const child of node.children) if (child.children.length) walk(child, next);
  };
  const looseRoots = roots.filter((root) => !root.children.length);
  if (looseRoots.length) groups.push({ path: [], points: looseRoots });
  for (const root of roots) if (root.children.length) walk(root, []);
  return groups;
}

function GroupLabel({
  path,
  onPractise,
}: {
  path: SpecificationPointProgress[];
  onPractise: (pointId: string) => void;
}) {
  const full = path.map((step) => `${step.ref} ${step.title}`).join(' › ');
  return (
    <div className="flex items-center gap-2 pl-1" title={full}>
      <h3 className="text-sm tabular-nums text-ink-soft">
        <span aria-hidden="true">{path.map((step) => step.ref).join(' › ')}</span>
        <span className="sr-only">{full}</span>
      </h3>
      <span className="h-px flex-1 bg-line" />
      <PractiseButton point={path[path.length - 1]} onPractise={onPractise} />
    </div>
  );
}

function About({
  report,
}: {
  report: Extract<ReturnType<typeof buildSpecificationProgress>, { kind: 'ready' }>;
}) {
  const { source } = report.specification;
  return (
    <details className="relative">
      <summary
        aria-label="About these numbers"
        title="About these numbers"
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        <InfoIcon width={18} height={18} />
      </summary>
      <div className="absolute right-0 top-11 z-20 w-[min(20rem,calc(100vw-3rem))] space-y-2 rounded-2xl border border-line bg-surface-raised p-4 text-xs text-ink-soft shadow-xl">
        <ul className="space-y-1.5">
          {(['new', 'taught', 'started', 'reviewed', 'unlinked'] as const).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <StatusIcon status={status} /> {STATUS_LABEL[status]}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <MiniRing value={0.6} size={16} /> Predicted recall
          </li>
          <li className="flex items-center gap-2">
            <AlertIcon width={16} height={16} className="text-warning" /> Question gaps
          </li>
        </ul>
        <p>
          Coverage is linked content, not readiness. Taught at school does not mean remembered.
          Filters change this view only.
        </p>
        <p>
          {/^https?:\/\//i.test(source.url) ? (
            <a className="underline" href={source.url} target="_blank" rel="noreferrer">
              {source.document}
            </a>
          ) : (
            source.document
          )}
          , {source.issue}
        </p>
        {(report.unresolvedLinks.length > 0 || report.unmappedConcepts.length > 0) && (
          <ul aria-label="Author checks" className="max-h-40 space-y-1 overflow-y-auto break-words">
            {report.unresolvedLinks.map(({ concept, pointId }) => (
              <li key={`${concept.id}:${pointId}`}>
                {concept.name}: unresolved {pointId}
              </li>
            ))}
            {report.unmappedConcepts.map((concept) => (
              <li key={concept.id}>{concept.name}: no specification links</li>
            ))}
          </ul>
        )}
      </div>
    </details>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const forecastLabel = progressHeading(input.course);
  const papers = report.kind === 'ready' ? papersForSelection(report.specification, selection) : [];
  const hasFilters =
    report.kind === 'ready' &&
    (report.specification.tiers.length > 0 ||
      report.specification.routes.length > 0 ||
      papers.length > 1);
  return (
    <SectionCard aria-labelledby={titleId} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={titleId}
          className="font-display text-2xl"
          title={report.kind === 'ready' ? report.specification.title : undefined}
        >
          Specification
        </h2>
        {report.kind === 'ready' && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              role="img"
              aria-label={`${report.coveredPoints} of ${report.totalPoints} points have practice content`}
              title={`${report.coveredPoints} of ${report.totalPoints} points have practice content`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-sm tabular-nums"
            >
              <FolderIcon width={14} height={14} className="text-ink-soft" />
              {report.coveredPoints}/{report.totalPoints}
            </span>
            <div
              className={cn(
                'order-last basis-full flex-wrap gap-2 sm:contents',
                filtersOpen ? 'flex' : 'hidden',
              )}
            >
              {report.specification.tiers.length > 0 && (
                <Select
                  aria-label="Tier"
                  className="min-h-9 text-sm"
                  value={selection.tier ?? ''}
                  onChange={(event) =>
                    setFilter((old) => ({
                      ...old,
                      tier: event.target.value || undefined,
                      paperId: undefined,
                    }))
                  }
                >
                  <option value="">All tiers</option>
                  {report.specification.tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name}
                    </option>
                  ))}
                </Select>
              )}
              {report.specification.routes.length > 0 && (
                <Select
                  aria-label="Route"
                  className="min-h-9 text-sm"
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
              )}
              {papers.length > 1 && (
                <Select
                  aria-label="Paper"
                  className="min-h-9 text-sm"
                  value={filter.paperId ?? ''}
                  onChange={(event) =>
                    setFilter((old) => ({ ...old, paperId: event.target.value || undefined }))
                  }
                >
                  <option value="">All papers</option>
                  {papers.map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.ref}: {paper.title}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {hasFilters && (
              <button
                type="button"
                aria-label="Filters"
                aria-expanded={filtersOpen}
                title="Filters"
                onClick={() => setFiltersOpen((value) => !value)}
                className={cn(
                  'grid size-9 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:hidden',
                  filtersOpen && 'bg-ink/5 text-ink',
                )}
              >
                <FilterIcon width={18} height={18} />
              </button>
            )}
            <About report={report} />
          </div>
        )}
      </div>
      {report.kind !== 'ready' ? (
        <p className="text-sm text-ink-soft">
          {report.kind === 'missing'
            ? 'No specification supplied.'
            : 'Specification unavailable. Your study records are kept.'}
        </p>
      ) : report.roots.length ? (
        groupsOf(report.roots).map((group) => (
          <div key={group.path.map((step) => step.id).join('/') || 'root'} className="space-y-1">
            {group.path.length > 0 && <GroupLabel path={group.path} onPractise={onPractise} />}
            <ul
              aria-label={group.path.length ? `Points within ${group.path.at(-1)!.ref}` : 'Points'}
            >
              {group.points.map((point) => (
                <PointRow
                  key={point.id}
                  point={point}
                  forecastLabel={forecastLabel}
                  onPractise={onPractise}
                  evidenceLoading={practice === undefined}
                />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-sm text-ink-soft">No points match.</p>
      )}
    </SectionCard>
  );
}
