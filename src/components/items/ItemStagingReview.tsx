import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { m as motion } from 'motion/react';
import type { Lesson } from '../../db/types';
import type { QuestionDefinition } from '../../questions/types';
import {
  diffImport,
  type ExistingCardForDiff,
  type ProposedImportItem,
} from '../../mcp/diffImport';
import { createBatchFixedQuestion } from '../../items/batchQuestionImport';
import {
  parseBatchOutput,
  parseEditedCandidate,
  parseRevisedItems,
  type BatchCandidate,
} from '../../items/batchStaging';
import { BATCH_OUTPUT_START, buildBatchRevisionPrompt } from '../../items/prompts';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { ItemStagingCandidateRow, type StagingDecision } from './ItemStagingCandidateRow';

interface ItemStagingReviewProps {
  courseId: string;
  lessons: Lesson[];
  questions: QuestionDefinition[];
  onDirtyChange?: (dirty: boolean) => void;
  sourceInputRef?: Ref<HTMLTextAreaElement>;
}

type ProposedWithCandidateId = ProposedImportItem & { candidateId: string };

export function ItemStagingReview({
  courseId,
  lessons,
  questions,
  onDirtyChange,
  sourceInputRef,
}: ItemStagingReviewProps) {
  const { notify } = useToast();
  const [source, setSource] = useState('');
  const [submittedSource, setSubmittedSource] = useState<string | null>(null);
  const [targetLessonId, setTargetLessonId] = useState(lessons[0]?.id ?? '');
  const [edits, setEdits] = useState<Map<string, BatchCandidate>>(new Map());
  const [decisions, setDecisions] = useState<Map<string, StagingDecision>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [batchRevisionOpen, setBatchRevisionOpen] = useState(false);
  const [batchComplaint, setBatchComplaint] = useState('');
  const [batchRevisionSource, setBatchRevisionSource] = useState('');
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const batchRevisionTriggerRef = useRef<HTMLButtonElement>(null);
  const acceptAllCleanRef = useRef<HTMLButtonElement>(null);
  const batchComplaintRef = useRef<HTMLTextAreaElement>(null);
  const previousBatchRevisionOpen = useRef(batchRevisionOpen);

  useLayoutEffect(() => {
    if (batchRevisionOpen && !previousBatchRevisionOpen.current) {
      batchComplaintRef.current?.focus();
    } else if (!batchRevisionOpen && previousBatchRevisionOpen.current) {
      (batchRevisionTriggerRef.current ?? acceptAllCleanRef.current)?.focus();
    }
    previousBatchRevisionOpen.current = batchRevisionOpen;
  }, [batchRevisionOpen]);

  useEffect(() => {
    onDirtyChange?.(
      source.trim().length > 0 ||
        submittedSource !== null ||
        edits.size > 0 ||
        decisions.size > 0 ||
        batchRevisionSource.trim().length > 0,
    );
  }, [batchRevisionSource, decisions, edits, onDirtyChange, source, submittedSource]);

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
    const existing: ExistingCardForDiff[] = questions
      .filter(
        (question) =>
          question.kind === 'fixed' &&
          (question.primaryLessonId === targetLessonId ||
            question.additionalLessonIds.includes(targetLessonId)),
      )
      .map((question) => ({
        id: question.id,
        front: question.kind === 'fixed' ? question.prompt : '',
        back: question.kind === 'fixed' ? question.explanation : '',
        tags: question.tags,
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
  }, [questions, candidates, targetLessonId]);

  const decisionFor = (candidate: BatchCandidate): StagingDecision =>
    decisions.get(candidate.id) ?? 'staged';
  const cleanCandidates = candidates.filter(
    (candidate) =>
      decisionFor(candidate) === 'staged' && candidate.payload && !duplicateIds.has(candidate.id),
  );
  const failingCandidates = candidates.filter(
    (candidate) => decisionFor(candidate) === 'staged' && candidate.errors.length > 0,
  );

  function reviewBatch() {
    setSubmittedSource(source);
    setEdits(new Map());
    setDecisions(new Map());
    setEditingId(null);
    setBatchRevisionOpen(false);
    setBatchRevisionSource('');
  }

  async function copyBatchRevisionPrompt() {
    try {
      await navigator.clipboard.writeText(
        buildBatchRevisionPrompt({
          items: failingCandidates.map((candidate) => ({
            itemJson: candidate.sourceJson,
            validationErrors: candidate.errors,
          })),
          complaint: batchComplaint,
        }),
      );
      notify('Revision prompt copied to the clipboard.', 'positive');
    } catch {
      notify('Could not copy the revision prompt.', 'negative');
    }
  }

  function applyBatchRevision() {
    const result = parseRevisedItems(batchRevisionSource);
    if (result.error) {
      notify(result.error, 'negative');
      return;
    }
    // Revised items are matched to the items they replace by position, which is what the prompt
    // asks for and all a bare item carries. A count mismatch means the model added, dropped or
    // reordered something, so nothing is applied rather than silently pairing the wrong items.
    if (result.items.length !== failingCandidates.length) {
      notify(
        `The response has ${result.items.length} item${result.items.length === 1 ? '' : 's'} but ${failingCandidates.length} needed revision.`,
        'negative',
      );
      return;
    }

    setEdits((current) => {
      const next = new Map(current);
      failingCandidates.forEach((candidate, position) => {
        next.set(
          candidate.id,
          parseEditedCandidate(JSON.stringify(result.items[position], null, 2), candidate.index),
        );
      });
      return next;
    });
    setBatchRevisionOpen(false);
    setBatchRevisionSource('');
    notify(
      `Applied ${result.items.length} revised item${result.items.length === 1 ? '' : 's'}.`,
      'positive',
    );
  }

  async function acceptCandidate(candidate: BatchCandidate) {
    if (!candidate.payload || !targetLessonId || decisionFor(candidate) !== 'staged') return;
    await createBatchFixedQuestion({
      courseId,
      primaryLessonId: targetLessonId,
      prompt: candidate.question,
      payload: candidate.payload,
      explanation: candidate.explanation,
      targetConceptName: candidate.targetConcept,
      prerequisiteConceptNames: candidate.prerequisiteConcepts,
    });
    setDecisions((current) => new Map(current).set(candidate.id, 'accepted'));
  }

  async function acceptOne(candidate: BatchCandidate) {
    setImporting(true);
    try {
      await acceptCandidate(candidate);
      notify('Question added to the lesson.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add the Question.', 'negative');
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
      notify(`Added ${accepted} Question${accepted === 1 ? '' : 's'} to the lesson.`, 'positive');
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
          Generated Question batch
          <textarea
            ref={sourceInputRef}
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

      <AnimatedDisclosure open={Boolean(parsed?.error)}>
        {parsed?.error ? (
          <div className="rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-sm text-negative">
            {parsed.error}
          </div>
        ) : null}
      </AnimatedDisclosure>

      <AnimatedDisclosure open={Boolean(parsed && !parsed.error)}>
        {parsed && !parsed.error ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <div>
                <h3 className="font-display text-xl">Staged Questions</h3>
                <p className="mt-1 text-sm text-ink-faint">
                  {candidates.length} proposed Question{candidates.length === 1 ? '' : 's'} ·{' '}
                  {cleanCandidates.length} clean
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {failingCandidates.length > 0 && !batchRevisionOpen && (
                  <Button
                    ref={batchRevisionTriggerRef}
                    variant="ghost"
                    onClick={() => setBatchRevisionOpen(true)}
                  >
                    Revise {failingCandidates.length} with AI
                  </Button>
                )}
                <Button
                  ref={acceptAllCleanRef}
                  variant="primary"
                  disabled={cleanCandidates.length === 0 || importing}
                  onClick={() => void acceptAllClean()}
                >
                  Accept all clean
                </Button>
              </div>
            </div>

            <AnimatedDisclosure open={batchRevisionOpen && failingCandidates.length > 0}>
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <p className="text-sm text-ink-soft">
                  The prompt carries each failing item and its validation errors. Paste the reply
                  back below; the {failingCandidates.length} revised item
                  {failingCandidates.length === 1 ? '' : 's'} replace only those, in order.
                </p>
                <label className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
                  Anything else to change? (optional)
                  <textarea
                    ref={batchComplaintRef}
                    value={batchComplaint}
                    onChange={(event) => setBatchComplaint(event.target.value)}
                    rows={2}
                    placeholder="Applies to every item in the prompt…"
                    className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
                  Revised reply
                  <textarea
                    value={batchRevisionSource}
                    onChange={(event) => setBatchRevisionSource(event.target.value)}
                    rows={5}
                    placeholder="Paste the model's reply here"
                    className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-faint focus:border-accent"
                  />
                </label>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setBatchRevisionOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyBatchRevisionPrompt()}
                  >
                    Copy revision prompt
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!batchRevisionSource.trim()}
                    onClick={applyBatchRevision}
                  >
                    Apply revisions
                  </Button>
                </div>
              </div>
            </AnimatedDisclosure>

            <div className="space-y-3">
              {candidates.map((candidate) => (
                <motion.div
                  key={candidate.id}
                  layout={multiplier > 0 ? 'position' : undefined}
                  transition={{ duration: 0.2 * multiplier, ease: [0.16, 1, 0.3, 1] }}
                >
                  <ItemStagingCandidateRow
                    candidate={candidate}
                    decision={decisionFor(candidate)}
                    duplicate={duplicateIds.has(candidate.id)}
                    editing={editingId === candidate.id}
                    importing={importing}
                    motionMultiplier={multiplier}
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
                </motion.div>
              ))}
            </div>
          </div>
        ) : null}
      </AnimatedDisclosure>
    </div>
  );
}
