import { useEffect, useMemo, useState } from 'react';
import type { Card, Lesson } from '../../db/types';
import { createLessonCard } from '../../db/repository';
import {
  diffImport,
  type ExistingCardForDiff,
  type ProposedImportItem,
} from '../../mcp/diffImport';
import {
  parseBatchOutput,
  parseEditedCandidate,
  type BatchCandidate,
} from '../../items/batchStaging';
import { BATCH_OUTPUT_START, buildItemRevisionPrompt } from '../../items/prompts';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { StagedItemEditor } from './StagedItemEditor';

interface ItemStagingReviewProps {
  courseId: string;
  lessons: Lesson[];
  cards: Card[];
}

type Decision = 'staged' | 'accepted' | 'rejected';
type ProposedWithCandidateId = ProposedImportItem & { candidateId: string };

export function ItemStagingReview({ courseId, lessons, cards }: ItemStagingReviewProps) {
  const { notify } = useToast();
  const [source, setSource] = useState('');
  const [submittedSource, setSubmittedSource] = useState<string | null>(null);
  const [targetLessonId, setTargetLessonId] = useState(lessons[0]?.id ?? '');
  const [edits, setEdits] = useState<Map<string, BatchCandidate>>(new Map());
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (lessons.some((lesson) => lesson.id === targetLessonId)) return;
    setTargetLessonId(lessons[0]?.id ?? '');
  }, [lessons, targetLessonId]);

  const parsed = useMemo(
    () => (submittedSource === null ? null : parseBatchOutput(submittedSource)),
    [submittedSource],
  );
  const candidates = useMemo(
    () => parsed?.candidates.map((candidate) => edits.get(candidate.id) ?? candidate) ?? [],
    [edits, parsed],
  );

  const duplicateIds = useMemo(() => {
    const existing: ExistingCardForDiff[] = cards
      .filter((card) => card.primaryLessonId === targetLessonId)
      .map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        tags: card.tags,
        lessonId: targetLessonId,
      }));
    const proposed: ProposedWithCandidateId[] = candidates
      .filter((candidate) => candidate.question)
      .map((candidate) => ({
        candidateId: candidate.id,
        front: candidate.question,
        back: '',
        lessonId: targetLessonId,
        tags: [],
      }));
    const diff = diffImport(existing, proposed);
    return new Set(
      [...diff.toSkip, ...diff.toUpdate.map((entry) => entry.item)].map(
        (item) => (item as ProposedWithCandidateId).candidateId,
      ),
    );
  }, [cards, candidates, targetLessonId]);

  const decisionFor = (candidate: BatchCandidate): Decision =>
    decisions.get(candidate.id) ?? 'staged';
  const cleanCandidates = candidates.filter(
    (candidate) =>
      decisionFor(candidate) === 'staged' && candidate.payload && !duplicateIds.has(candidate.id),
  );

  function reviewBatch() {
    setSubmittedSource(source);
    setEdits(new Map());
    setDecisions(new Map());
    setEditingId(null);
  }

  async function acceptCandidate(candidate: BatchCandidate) {
    if (!candidate.payload || !targetLessonId || decisionFor(candidate) !== 'staged') return;
    await createLessonCard(
      courseId,
      targetLessonId,
      'front_back',
      candidate.question,
      '',
      [],
      candidate.payload,
    );
    setDecisions((current) => new Map(current).set(candidate.id, 'accepted'));
  }

  async function acceptOne(candidate: BatchCandidate) {
    setImporting(true);
    try {
      await acceptCandidate(candidate);
      notify('Item added to the lesson.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add the item.', 'negative');
    } finally {
      setImporting(false);
    }
  }

  async function acceptAllClean() {
    if (cleanCandidates.length === 0) return;
    setImporting(true);
    let accepted = 0;
    try {
      for (const candidate of cleanCandidates) {
        await acceptCandidate(candidate);
        accepted += 1;
      }
      notify(`Added ${accepted} item${accepted === 1 ? '' : 's'} to the lesson.`, 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add every item.', 'negative');
    } finally {
      setImporting(false);
    }
  }

  function beginEdit(candidate: BatchCandidate) {
    setEditingId(candidate.id);
  }

  function applyEdit(candidate: BatchCandidate, sourceJson: string) {
    const next = parseEditedCandidate(sourceJson, candidate.index);
    setEdits((current) => new Map(current).set(candidate.id, next));
    setDecisions((current) => new Map(current).set(candidate.id, 'staged'));
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="flex flex-col gap-2 text-sm text-ink-soft">
          Generated batch
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            rows={8}
            placeholder={`Paste the block beginning ${BATCH_OUTPUT_START}`}
            className="resize-y rounded-xl border border-line-strong bg-surface px-4 py-3 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-faint focus:border-accent"
          />
        </label>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-ink-soft">
            Target lesson
            <select
              value={targetLessonId}
              onChange={(event) => setTargetLessonId(event.target.value)}
              disabled={lessons.length === 0}
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-ink outline-none focus:border-accent"
            >
              {lessons.length === 0 && <option value="">No lessons available</option>}
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={!source.trim() || !targetLessonId}
            onClick={reviewBatch}
          >
            Review batch
          </Button>
        </div>
      </div>

      {parsed?.error && (
        <div className="rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-sm text-negative">
          {parsed.error}
        </div>
      )}

      {parsed && !parsed.error && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <div>
              <h3 className="font-display text-xl">Staged items</h3>
              <p className="mt-1 text-sm text-ink-faint">
                {candidates.length} proposed item{candidates.length === 1 ? '' : 's'} ·{' '}
                {cleanCandidates.length} clean
              </p>
            </div>
            <Button
              variant="primary"
              disabled={cleanCandidates.length === 0 || importing}
              onClick={() => void acceptAllClean()}
            >
              Accept all clean
            </Button>
          </div>

          <div className="space-y-3">
            {candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                decision={decisionFor(candidate)}
                duplicate={duplicateIds.has(candidate.id)}
                editing={editingId === candidate.id}
                importing={importing}
                onBeginEdit={() => beginEdit(candidate)}
                onCancelEdit={() => setEditingId(null)}
                onApplyEdit={(sourceJson) => applyEdit(candidate, sourceJson)}
                onAccept={() => void acceptOne(candidate)}
                onReject={() =>
                  setDecisions((current) => new Map(current).set(candidate.id, 'rejected'))
                }
                onRestore={() =>
                  setDecisions((current) => new Map(current).set(candidate.id, 'staged'))
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface CandidateRowProps {
  candidate: BatchCandidate;
  decision: Decision;
  duplicate: boolean;
  editing: boolean;
  importing: boolean;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onApplyEdit: (sourceJson: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
}

function CandidateRow({
  candidate,
  decision,
  duplicate,
  editing,
  importing,
  onBeginEdit,
  onCancelEdit,
  onApplyEdit,
  onAccept,
  onReject,
  onRestore,
}: CandidateRowProps) {
  const { notify } = useToast();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [complaint, setComplaint] = useState('');
  const ready = Boolean(candidate.payload);

  async function copyRevisionPrompt() {
    const raw = asRecord(candidate.raw);
    try {
      await navigator.clipboard.writeText(
        buildItemRevisionPrompt({
          itemJson: candidate.sourceJson,
          scheme: typeof raw?.scheme === 'string' ? raw.scheme : undefined,
          failingFixture: firstFailingFixture(candidate, raw),
          complaint,
          validationErrors: candidate.errors,
        }),
      );
      notify('Revision prompt copied to the clipboard.', 'positive');
      setRevisionOpen(false);
    } catch {
      notify('Could not copy the revision prompt.', 'negative');
    }
  }

  return (
    <article
      className={cn(
        'rounded-2xl border p-4 md:p-5',
        decision === 'accepted'
          ? 'border-positive/30 bg-positive/5'
          : decision === 'rejected'
            ? 'border-line bg-ink/[0.025] opacity-70'
            : ready
              ? 'border-line bg-surface'
              : 'border-negative/30 bg-negative/5',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">
              Item {candidate.index + 1}
            </span>
            <StatusPill tone={ready ? 'positive' : 'negative'}>
              {ready ? 'Valid' : 'Needs attention'}
            </StatusPill>
            {candidate.kind && <StatusPill tone="neutral">{candidate.kind}</StatusPill>}
            {duplicate && <StatusPill tone="warning">Likely duplicate</StatusPill>}
            {decision !== 'staged' && (
              <StatusPill tone={decision === 'accepted' ? 'positive' : 'neutral'}>
                {decision}
              </StatusPill>
            )}
          </div>
          <h4 className="mt-2 text-base font-medium text-ink">
            {candidate.question || 'Untitled item'}
          </h4>
          <p className="mt-1 text-sm text-ink-faint">
            {candidate.kind === 'working'
              ? candidate.fixtureStatus
                ? `${candidate.fixtureStatus.passed} of ${candidate.fixtureStatus.total} fixtures pass`
                : 'Fixtures unavailable'
              : candidate.kind === 'numeric'
                ? 'Numeric answer checked'
                : 'Unknown item kind'}
          </p>
        </div>

        {!editing && decision === 'staged' && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={onBeginEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject}>
              Reject
            </Button>
            <Button size="sm" variant="secondary" disabled={!ready || importing} onClick={onAccept}>
              Accept
            </Button>
          </div>
        )}
        {decision === 'rejected' && (
          <Button size="sm" variant="ghost" onClick={onRestore}>
            Restore
          </Button>
        )}
      </div>

      {duplicate && decision === 'staged' && (
        <p className="mt-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-sm text-warning-fg">
          This question resembles an item already in the target lesson. Review it before accepting.
        </p>
      )}

      {candidate.errors.length > 0 && decision === 'staged' && (
        <ul className="mt-3 space-y-1 text-sm text-negative">
          {candidate.errors.map((error, index) => (
            <li key={`${candidate.id}-error-${index}`}>{error}</li>
          ))}
        </ul>
      )}

      {!editing && decision === 'staged' && !revisionOpen && (
        <Button className="mt-3" size="sm" variant="ghost" onClick={() => setRevisionOpen(true)}>
          Revise with AI
        </Button>
      )}

      {revisionOpen && decision === 'staged' && (
        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-4">
          <label className="flex flex-col gap-2 text-sm text-ink-soft">
            What should change?
            <textarea
              value={complaint}
              onChange={(event) => setComplaint(event.target.value)}
              rows={3}
              placeholder="Describe the marking or wording problem…"
              className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!complaint.trim()}
              onClick={() => void copyRevisionPrompt()}
            >
              Copy revision prompt
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <StagedItemEditor candidate={candidate} onCancel={onCancelEdit} onApply={onApplyEdit} />
      )}
    </article>
  );
}

function firstFailingFixture(
  candidate: BatchCandidate,
  raw: Record<string, unknown> | null,
): unknown {
  if (!Array.isArray(raw?.fixtures)) return undefined;
  for (const error of candidate.errors) {
    const match = error.match(/^Fixture (\d+)/);
    if (!match) continue;
    return raw.fixtures[Number(match[1]) - 1];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
        tone === 'positive' && 'bg-positive/10 text-positive',
        tone === 'negative' && 'bg-negative/10 text-negative',
        tone === 'warning' && 'bg-warning/10 text-warning-fg',
        tone === 'neutral' && 'bg-ink/5 text-ink-soft',
      )}
    >
      {children}
    </span>
  );
}
