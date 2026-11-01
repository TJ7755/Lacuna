import { COURSE_PAGE_FRAME, COURSE_PAGE_TITLE } from '../course/coursePageLayout';
import { PageLoading } from '../ui/PageLoadingBoundary';
// Merge review surface (Arc 7 §7.5, Task 7). A course-scoped route reached from the
// "Update available" entry point on the course card and CoursePath header. It reads the
// course's `pendingMergeReviews` row and lets the student resolve each queued update,
// removal and conflict — per row or in bulk — through the resolution functions in
// `src/db/mergeImport.ts`. British English throughout.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../ui/AppLink';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  useCourse,
  useCourseCards,
  useLessons,
  usePendingMergeReview,
} from '../../state/useCourseData';
import {
  acceptAllMergeReview,
  acceptMergeReviewItems,
  rejectMergeReviewItems,
} from '../../db/mergeImport';
import type { Note } from '@lacuna/core/db/types';
import { useActionFocus } from '../../hooks/useActionFocus';
import { Button } from '../ui/Button';
import { ChevronLeftIcon } from '../ui/icons';
import { MergeReviewRow } from './MergeReviewRow';
import { buildMergeReviewRows, type ReviewRowModel } from './mergeReviewRows';

export function MergeReviewPanel() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const course = useCourse(courseId);
  const review = usePendingMergeReview(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCards(courseId);
  const notes = useLiveQuery(async () => {
    if (!courseId) return [] as Note[];
    const courseLessons = await db.lessons.where('courseId').equals(courseId).toArray();
    const ids = courseLessons.map((lesson) => lesson.id);
    if (ids.length === 0) return [] as Note[];
    return db.notes.where('lessonId').anyOf(ids).toArray();
  }, [courseId]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const applying = useRef(false);
  const retryTarget = useRef<HTMLElement | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [decision, setDecision] = useState<{
    key?: string;
    index: number;
    result: string;
    beforeCount: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLAnchorElement>(null);
  const { remember, restore } = useActionFocus();
  const rows = useMemo(
    () => buildMergeReviewRows(review, lessons, notes, cards),
    [review, lessons, notes, cards],
  );
  const ordered = useMemo(() => [...rows.updates, ...rows.removals, ...rows.conflicts], [rows]);

  useLayoutEffect(() => {
    if (!pending && error) {
      restore(retryTarget.current);
      retryTarget.current = null;
    }
  }, [error, pending, restore]);

  useLayoutEffect(() => {
    if (pending || !decision || review === undefined) return;
    if (
      decision.key
        ? ordered.some((row) => row.key === decision.key)
        : ordered.length >= decision.beforeCount
    )
      return;
    const next = ordered[Math.min(decision.index, ordered.length - 1)];
    const element = next
      ? (Array.from(root.current?.querySelectorAll<HTMLElement>('[data-merge-row]') ?? [])
          .find((row) => row.dataset.mergeRow === next.key)
          ?.querySelector<HTMLElement>('[data-merge-primary]') ?? null)
      : back.current;
    restore(element);
    if (element && document.activeElement === element)
      element.scrollIntoView?.({ block: 'nearest' });
    setAnnouncement(
      `${decision.result} ${ordered.length ? `${ordered.length} change${ordered.length === 1 ? '' : 's'} remaining.` : 'All changes reviewed.'}`,
    );
    setDecision(null);
  }, [decision, ordered, pending, restore, review]);

  const apply = async (accept: boolean, row?: ReviewRowModel) => {
    if (!review || applying.current) return;
    applying.current = true;
    retryTarget.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    remember();
    setPending(true);
    setError('');
    setDecision({
      key: row?.key,
      index: row ? ordered.indexOf(row) : 0,
      result: accept ? (row ? 'Accepted.' : 'Updates accepted.') : 'Kept your version.',
      beforeCount: ordered.length,
    });
    try {
      if (!row) await acceptAllMergeReview(review.id);
      else
        await (accept ? acceptMergeReviewItems : rejectMergeReviewItems)(review.id, [
          { kind: row.kind, entityId: row.entityId },
        ]);
    } catch {
      setDecision(null);
      setError('Could not apply this decision. Try again.');
    } finally {
      applying.current = false;
      setPending(false);
    }
  };

  const backTo = courseId ? `/course/${courseId}` : '/';
  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const status = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
  const backLink = (
    <Link
      ref={back}
      to={backTo}
      className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
    >
      <ChevronLeftIcon width={16} height={16} />
      Back to course
    </Link>
  );

  // Loading.
  if (review === undefined || course === undefined) return <PageLoading />;

  // Empty state: navigated here with nothing outstanding, or completed this review.
  if (review === null)
    return (
      <div ref={root} className={`${COURSE_PAGE_FRAME} py-6 md:py-8`}>
        {backLink}
        {status}
        <div className="rounded-3xl bg-surface card-surface p-6 text-center md:p-8">
          <p className="text-sm text-ink-soft">
            This course is up to date. There is nothing to review.
          </p>
        </div>
      </div>
    );

  const createdCount =
    review.diff.creates.lessons.length +
    review.diff.creates.notes.length +
    review.diff.creates.cards.length;
  const sourceLabel = course?.distributedCopy?.sourceLabel;
  const headerLine = sourceLabel
    ? `Update from ${sourceLabel} · revision ${review.revision}`
    : `Update · revision ${review.revision}`;
  const renderRow = (row: ReviewRowModel, section: 'update' | 'removal' | 'conflict') => {
    const removal = section === 'removal' || row.conflictRemoval;
    const conflict = section === 'conflict';
    return (
      <MergeReviewRow
        key={row.key}
        row={row}
        expanded={expanded.has(row.key)}
        onToggle={() => toggle(row.key)}
        pending={pending}
        note={
          conflict
            ? removal
              ? "You've edited this item, and it was removed from the course."
              : "You've edited this item."
            : removal
              ? 'This item is no longer in the course.'
              : undefined
        }
        consequence={
          removal
            ? `Remove deletes this item. ${conflict ? 'Keep mine' : 'Keep'} retains your copy.`
            : conflict
              ? 'Keep mine retains your edits. Take theirs replaces them.'
              : 'Accept replaces changed fields. Keep mine retains your copy.'
        }
        // Conflicts retain the student's version unless they explicitly choose otherwise (§7.5).
        primary={{
          label: conflict ? 'Keep mine' : removal ? 'Remove' : 'Accept',
          emphasis: conflict || !removal,
          onClick: () => {
            void apply(!conflict, row);
          },
        }}
        secondary={{
          label: conflict ? (removal ? 'Remove' : 'Take theirs') : removal ? 'Keep' : 'Keep mine',
          emphasis: !conflict && !!removal,
          onClick: () => {
            void apply(conflict, row);
          },
        }}
      />
    );
  };
  return (
    <div ref={root} className={`${COURSE_PAGE_FRAME} py-6 md:py-8`}>
      {backLink}
      {status}
      <header className="mb-8">
        <h1 className={COURSE_PAGE_TITLE}>{course?.name ?? 'Course update'}</h1>
        <p className="mt-1 text-sm text-ink-soft">{headerLine}</p>
      </header>
      {createdCount > 0 && (
        <p className="mb-8 text-sm text-ink-faint">
          {createdCount} new item{createdCount === 1 ? ' was' : 's were'} added automatically.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-negative">
          {error}
        </p>
      )}
      {rows.updates.length > 0 && (
        <Section title="Updates">{rows.updates.map((row) => renderRow(row, 'update'))}</Section>
      )}
      {rows.removals.length > 0 && (
        <Section title="Removals">{rows.removals.map((row) => renderRow(row, 'removal'))}</Section>
      )}
      {rows.conflicts.length > 0 && (
        <Section title="Conflicts">
          {rows.conflicts.map((row) => renderRow(row, 'conflict'))}
        </Section>
      )}
      {ordered.length === 0 && (
        <div className="rounded-3xl bg-surface card-surface p-6 text-center md:p-8">
          <p className="text-sm text-ink-soft">Everything in this update has been reviewed.</p>
        </div>
      )}
      {ordered.length > 0 && (
        <footer className="rounded-3xl bg-surface p-6 card-surface">
          <p className="mb-3 text-xs text-ink-soft">
            Accept all applies updates and removals. Conflicts need your decision.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(backTo)}>
              Review later
            </Button>
            <Button
              variant="secondary"
              disabled={pending || rows.updates.length + rows.removals.length === 0}
              onClick={() => {
                void apply(true);
              }}
            >
              Accept all
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-xl text-ink">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
