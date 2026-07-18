// Merge review surface (Arc 7 §7.5, Task 7). A course-scoped route reached from the
// "Update available" entry point on the course card and CoursePath header. It reads the
// course's `pendingMergeReviews` row and lets the student resolve each queued update,
// removal and conflict — per row or in bulk — through the resolution functions in
// `src/db/mergeImport.ts`. British English throughout.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { useCourse, useCourseCards, useLessons, usePendingMergeReview } from '../../state/useCourseData';
import {
  acceptAllMergeReview,
  acceptMergeReviewItems,
  rejectMergeReviewItems,
  type MergeReviewItemKind,
} from '../../db/mergeImport';
import type { Card, Lesson, Note } from '../../db/types';
import type { ShareCardInput, ShareLessonInput, ShareNoteInput } from '../../db/lineageDiff';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import { ChevronDownIcon, ChevronLeftIcon } from '../ui/icons';
import { cn } from '../ui/cn';

/** Reduce Markdown to a single readable line for a row preview. Full content is shown
 *  via {@link MarkdownView} when a row is expanded; this is only the collapsed glance. */
function toPlainLine(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const KIND_LABEL: Record<MergeReviewItemKind, string> = {
  lesson: 'Lesson',
  note: 'Note',
  card: 'Card',
};

interface RowModel {
  key: string;
  kind: MergeReviewItemKind;
  entityId: string;
  section: 'update' | 'removal' | 'conflict';
  /** Identifying text: lesson/note name, or card front. */
  title: string;
  /** Salient field, glance form. */
  beforeLine: string;
  afterLine: string;
  /** Salient field, full form (Markdown) for the expanded view. */
  beforeFull: string;
  afterFull: string;
  /** A teacher removal of an item the student has also edited — no incoming content. */
  conflictRemoval?: boolean;
}

/** The single field most worth previewing for an entity kind, old and new. */
function cardFields(existing: Card | undefined, next: { type?: string; front?: string; back?: string }) {
  const frontChanged = next.front !== undefined && next.front !== existing?.front;
  if (frontChanged || existing?.back === undefined) {
    return { before: existing?.front ?? '', after: next.front ?? existing?.front ?? '' };
  }
  return { before: existing?.back ?? '', after: next.back ?? existing?.back ?? '' };
}

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
    const ids = courseLessons.map((l) => l.id);
    if (ids.length === 0) return [] as Note[];
    return db.notes.where('lessonId').anyOf(ids).toArray();
  }, [courseId]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byId = useMemo(() => {
    const lessonMap = new Map<string, Lesson>((lessons ?? []).map((l) => [l.id, l]));
    const noteMap = new Map<string, Note>((notes ?? []).map((n) => [n.id, n]));
    const cardMap = new Map<string, Card>((cards ?? []).map((c) => [c.id, c]));
    return { lessonMap, noteMap, cardMap };
  }, [lessons, notes, cards]);

  const rows = useMemo<{ updates: RowModel[]; removals: RowModel[]; conflicts: RowModel[] }>(() => {
    const empty = { updates: [], removals: [], conflicts: [] };
    if (!review) return empty;
    const { lessonMap, noteMap, cardMap } = byId;
    const diff = review.diff;

    const titleFor = (kind: MergeReviewItemKind, id: string): string => {
      if (kind === 'lesson') return lessonMap.get(id)?.name ?? 'Untitled lesson';
      if (kind === 'note') return noteMap.get(id)?.name ?? 'Untitled note';
      return toPlainLine(cardMap.get(id)?.front ?? '') || 'Untitled card';
    };

    const updates: RowModel[] = [];
    for (const u of diff.updates.lessons) {
      const before = lessonMap.get(u.id)?.name ?? '';
      const after = u.name ?? before;
      updates.push({
        key: `u-lesson-${u.id}`,
        kind: 'lesson',
        entityId: u.id,
        section: 'update',
        title: titleFor('lesson', u.id),
        beforeLine: toPlainLine(before),
        afterLine: toPlainLine(after),
        beforeFull: lessonMap.get(u.id)?.description ?? before,
        afterFull: u.description ?? u.name ?? after,
      });
    }
    for (const u of diff.updates.notes) {
      const existing = noteMap.get(u.id);
      const before = u.content !== undefined ? existing?.content ?? '' : existing?.name ?? '';
      const after = u.content ?? u.name ?? before;
      updates.push({
        key: `u-note-${u.id}`,
        kind: 'note',
        entityId: u.id,
        section: 'update',
        title: titleFor('note', u.id),
        beforeLine: toPlainLine(before),
        afterLine: toPlainLine(after),
        beforeFull: existing?.content ?? before,
        afterFull: u.content ?? existing?.content ?? before,
      });
    }
    for (const u of diff.updates.cards) {
      const existing = cardMap.get(u.id);
      const { before, after } = cardFields(existing, u);
      updates.push({
        key: `u-card-${u.id}`,
        kind: 'card',
        entityId: u.id,
        section: 'update',
        title: titleFor('card', u.id),
        beforeLine: toPlainLine(before),
        afterLine: toPlainLine(after),
        beforeFull: before,
        afterFull: after,
      });
    }

    const removals: RowModel[] = [];
    const removalIds: Array<[MergeReviewItemKind, string]> = [
      ...diff.removals.lessonIds.map((id) => ['lesson', id] as [MergeReviewItemKind, string]),
      ...diff.removals.noteIds.map((id) => ['note', id] as [MergeReviewItemKind, string]),
      ...diff.removals.cardIds.map((id) => ['card', id] as [MergeReviewItemKind, string]),
    ];
    for (const [kind, id] of removalIds) {
      removals.push({
        key: `r-${kind}-${id}`,
        kind,
        entityId: id,
        section: 'removal',
        title: titleFor(kind, id),
        beforeLine: '',
        afterLine: '',
        beforeFull: '',
        afterFull: '',
      });
    }

    const conflicts: RowModel[] = [];
    for (const c of diff.conflicts) {
      if (c.incoming === null) {
        conflicts.push({
          key: `c-${c.kind}-${c.entityId}`,
          kind: c.kind,
          entityId: c.entityId,
          section: 'conflict',
          title: titleFor(c.kind, c.entityId),
          beforeLine: '',
          afterLine: '',
          beforeFull: '',
          afterFull: '',
          conflictRemoval: true,
        });
        continue;
      }
      let before = '';
      let after = '';
      let beforeFull = '';
      let afterFull = '';
      if (c.kind === 'lesson') {
        const inc = c.incoming as ShareLessonInput;
        before = lessonMap.get(c.entityId)?.name ?? '';
        after = inc.n;
        beforeFull = lessonMap.get(c.entityId)?.description ?? before;
        afterFull = inc.d ?? inc.n;
      } else if (c.kind === 'note') {
        const inc = c.incoming as ShareNoteInput;
        before = noteMap.get(c.entityId)?.content ?? '';
        after = inc.c;
        beforeFull = before;
        afterFull = inc.c;
      } else {
        const inc = c.incoming as ShareCardInput;
        before = cardMap.get(c.entityId)?.front ?? '';
        after = inc.f;
        beforeFull = before;
        afterFull = inc.f;
      }
      conflicts.push({
        key: `c-${c.kind}-${c.entityId}`,
        kind: c.kind,
        entityId: c.entityId,
        section: 'conflict',
        title: titleFor(c.kind, c.entityId),
        beforeLine: toPlainLine(before),
        afterLine: toPlainLine(after),
        beforeFull,
        afterFull,
      });
    }

    return { updates, removals, conflicts };
  }, [review, byId]);

  const backTo = courseId ? `/course/${courseId}` : '/';

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const accept = (kind: MergeReviewItemKind, entityId: string) => {
    if (review) void acceptMergeReviewItems(review.id, [{ kind, entityId }]);
  };
  const reject = (kind: MergeReviewItemKind, entityId: string) => {
    if (review) void rejectMergeReviewItems(review.id, [{ kind, entityId }]);
  };

  // Loading.
  if (review === undefined || course === undefined) {
    return <div className="mx-auto max-w-3xl px-6 py-8 md:px-10" aria-hidden="true" />;
  }

  const backLink = (
    <Link
      to={backTo}
      className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
    >
      <ChevronLeftIcon width={16} height={16} />
      Back to course
    </Link>
  );

  // Empty state: navigated here with nothing outstanding.
  if (review === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
        {backLink}
        <div className="rounded-2xl border border-line bg-surface p-10 text-center">
          <p className="text-sm text-ink-soft">This course is up to date. There is nothing to review.</p>
        </div>
      </div>
    );
  }

  const createdCount =
    review.diff.creates.lessons.length + review.diff.creates.notes.length + review.diff.creates.cards.length;
  const outstanding = rows.updates.length + rows.removals.length + rows.conflicts.length;
  const sourceLabel = course?.distributedCopy?.sourceLabel;
  const headerLine = sourceLabel
    ? `Update from ${sourceLabel} · revision ${review.revision}`
    : `Update · revision ${review.revision}`;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-28 pt-8 md:px-10">
      {backLink}

      <header className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">{course?.name ?? 'Course update'}</h1>
        <p className="mt-1 text-sm text-ink-soft">{headerLine}</p>
      </header>

      {createdCount > 0 && (
        <p className="mb-8 text-sm text-ink-faint">
          {createdCount} new item{createdCount === 1 ? ' was' : 's were'} added automatically.
        </p>
      )}

      {rows.updates.length > 0 && (
        <Section title="Updates">
          {rows.updates.map((row) => (
            <ReviewRow
              key={row.key}
              row={row}
              expanded={expanded.has(row.key)}
              onToggle={() => toggle(row.key)}
              primary={{ label: 'Accept', emphasis: true, onClick: () => accept(row.kind, row.entityId) }}
              secondary={{ label: 'Keep mine', onClick: () => reject(row.kind, row.entityId) }}
            />
          ))}
        </Section>
      )}

      {rows.removals.length > 0 && (
        <Section title="Removals">
          {rows.removals.map((row) => (
            <ReviewRow
              key={row.key}
              row={row}
              note="This item is no longer in the course."
              primary={{ label: 'Remove', emphasis: true, onClick: () => accept(row.kind, row.entityId) }}
              secondary={{ label: 'Keep', onClick: () => reject(row.kind, row.entityId) }}
            />
          ))}
        </Section>
      )}

      {rows.conflicts.length > 0 && (
        <Section title="Conflicts">
          {rows.conflicts.map((row) => (
            <ReviewRow
              key={row.key}
              row={row}
              expanded={expanded.has(row.key)}
              onToggle={row.conflictRemoval ? undefined : () => toggle(row.key)}
              note={
                row.conflictRemoval
                  ? "You've edited this item, and it was removed from the course."
                  : "You've edited this item."
              }
              // Emphasis flips here: the student's version wins by default (§7.5).
              primary={{ label: 'Keep mine', emphasis: true, onClick: () => reject(row.kind, row.entityId) }}
              secondary={{
                label: row.conflictRemoval ? 'Remove' : 'Take theirs',
                onClick: () => accept(row.kind, row.entityId),
              }}
            />
          ))}
        </Section>
      )}

      {outstanding === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center">
          <p className="text-sm text-ink-soft">Everything in this update has been reviewed.</p>
        </div>
      )}

      {outstanding > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 px-6 py-3 md:px-10">
            <Button variant="ghost" onClick={() => navigate(backTo)}>
              Review later
            </Button>
            <Button variant="secondary" onClick={() => review && void acceptAllMergeReview(review.id)}>
              Accept all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs uppercase tracking-[0.16em] text-ink-faint">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

interface RowAction {
  label: string;
  emphasis?: boolean;
  onClick: () => void;
}

function ReviewRow({
  row,
  note,
  expanded = false,
  onToggle,
  primary,
  secondary,
}: {
  row: RowModel;
  note?: string;
  expanded?: boolean;
  onToggle?: () => void;
  primary: RowAction;
  secondary: RowAction;
}) {
  const showPreview = row.beforeLine !== '' || row.afterLine !== '';
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{KIND_LABEL[row.kind]}</span>
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                aria-label={expanded ? 'Collapse detail' : 'Expand detail'}
                aria-expanded={expanded}
                className="text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronDownIcon
                  width={14}
                  height={14}
                  className={cn('transition-transform', expanded && 'rotate-180')}
                />
              </button>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink">{row.title}</p>
          {note && <p className="mt-1 text-xs text-ink-faint">{note}</p>}

          {showPreview && !expanded && (
            <div className="mt-2 space-y-1 text-sm">
              <p className="truncate text-ink-faint">{row.beforeLine || '—'}</p>
              <p className="truncate font-medium text-ink">{row.afterLine || '—'}</p>
            </div>
          )}

          {showPreview && expanded && (
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Current</p>
                <div className="text-sm text-ink-soft">
                  <MarkdownView source={row.beforeFull || '—'} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Incoming</p>
                <div className="text-sm text-ink">
                  <MarkdownView source={row.afterFull || '—'} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={primary.onClick}
            className={cn(
              'min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              primary.emphasis ? 'text-accent hover:bg-accent/10' : 'text-ink-soft hover:bg-ink/5',
            )}
          >
            {primary.label}
          </button>
          <button
            type="button"
            onClick={secondary.onClick}
            className={cn(
              'min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              secondary.emphasis ? 'text-accent hover:bg-accent/10' : 'text-ink-soft hover:bg-ink/5',
            )}
          >
            {secondary.label}
          </button>
        </div>
      </div>
    </li>
  );
}
