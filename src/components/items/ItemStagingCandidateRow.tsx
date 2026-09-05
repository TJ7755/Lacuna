import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { BatchCandidate } from '../../items/batchStaging';
import { parseRevisedItems } from '../../items/batchStaging';
import { buildItemRevisionPrompt } from '../../items/prompts';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { StagedItemEditor } from './StagedItemEditor';

export type StagingDecision = 'staged' | 'accepted' | 'rejected';

interface ItemStagingCandidateRowProps {
  candidate: BatchCandidate;
  decision: StagingDecision;
  duplicate: boolean;
  editing: boolean;
  importing: boolean;
  motionMultiplier: number;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onApplyEdit: (sourceJson: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
}

export function ItemStagingCandidateRow({
  candidate,
  decision,
  duplicate,
  editing,
  importing,
  motionMultiplier,
  onBeginEdit,
  onCancelEdit,
  onApplyEdit,
  onAccept,
  onReject,
  onRestore,
}: ItemStagingCandidateRowProps) {
  const { notify } = useToast();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [complaint, setComplaint] = useState('');
  const [revisedSource, setRevisedSource] = useState('');
  const ready = Boolean(candidate.payload);
  const articleRef = useRef<HTMLElement>(null);
  // Scopes the edit-focus query to the staged editor, so a textarea rendered by the
  // revision panel (or anything else above it in the article) can never win it.
  const editorRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const revisionButtonRef = useRef<HTMLButtonElement>(null);
  const revisionComplaintRef = useRef<HTMLTextAreaElement>(null);
  const previousEditing = useRef(editing);
  const previousDecision = useRef(decision);
  const previousRevisionOpen = useRef(revisionOpen);

  useLayoutEffect(() => {
    if (editing && !previousEditing.current) {
      editorRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    } else if (!editing && previousEditing.current) {
      editButtonRef.current?.focus();
    }
    previousEditing.current = editing;

    if (decision === 'rejected' && previousDecision.current === 'staged') {
      restoreButtonRef.current?.focus();
    } else if (decision === 'accepted' && previousDecision.current === 'staged') {
      articleRef.current?.focus();
    } else if (decision === 'staged' && previousDecision.current === 'rejected') {
      editButtonRef.current?.focus();
    }
    previousDecision.current = decision;

    if (revisionOpen && !previousRevisionOpen.current) {
      revisionComplaintRef.current?.focus();
    } else if (!revisionOpen && previousRevisionOpen.current && decision === 'staged') {
      revisionButtonRef.current?.focus();
    }
    previousRevisionOpen.current = revisionOpen;
  }, [decision, editing, revisionOpen]);

  function applyRevisedItem() {
    const result = parseRevisedItems(revisedSource);
    if (result.error) {
      notify(result.error, 'negative');
      return;
    }
    // One item was sent, so the first item back is the revision. A model that returns more has
    // padded the reply rather than answered a different question.
    onApplyEdit(JSON.stringify(result.items[0], null, 2));
    setRevisionOpen(false);
    setRevisedSource('');
    notify('Revised item applied.', 'positive');
  }

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
    <motion.article
      ref={articleRef}
      tabIndex={-1}
      layout={motionMultiplier > 0 ? 'size' : undefined}
      transition={{ duration: 0.2 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
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
              Question {candidate.index + 1}
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
          <AnimatePresence initial={false} mode="wait">
            <motion.h4
              key={candidate.question || 'untitled'}
              initial={motionMultiplier > 0 ? { opacity: 0, y: 3 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={motionMultiplier > 0 ? { opacity: 0, y: -3 } : undefined}
              transition={{ duration: 0.14 * motionMultiplier }}
              className="mt-2 text-base font-medium text-ink"
            >
              {candidate.question || 'Untitled Question'}
            </motion.h4>
          </AnimatePresence>
          {candidate.targetConcept && (
            <p className="mt-1 text-sm text-ink-soft">
              Primary skill practised: {candidate.targetConcept}
              {candidate.prerequisiteConcepts.length > 0
                ? ` · Prerequisites: ${candidate.prerequisiteConcepts.join(', ')}`
                : ''}
            </p>
          )}
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

        <AnimatePresence initial={false} mode="popLayout">
          {!editing && decision === 'staged' ? (
            <motion.div
              key="candidate-actions"
              initial={motionMultiplier > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.14 * motionMultiplier }}
              className="flex flex-wrap gap-2"
            >
              <Button
                ref={editButtonRef}
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Editing and the revision panel must not be open together: the
                  // panel's complaint textarea would otherwise sit between the author
                  // and the editor, and its close-transition would steal focus.
                  setRevisionOpen(false);
                  onBeginEdit();
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject}>
                Reject
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!ready || importing}
                onClick={onAccept}
              >
                Accept
              </Button>
            </motion.div>
          ) : decision === 'rejected' ? (
            <motion.div
              key="restore-action"
              initial={motionMultiplier > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.14 * motionMultiplier }}
            >
              <Button ref={restoreButtonRef} size="sm" variant="ghost" onClick={onRestore}>
                Restore
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatedDisclosure open={duplicate && decision === 'staged'}>
        <p className="mt-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-sm text-warning-fg">
          This Question resembles one already in the target lesson. Review it before accepting.
        </p>
      </AnimatedDisclosure>

      <AnimatedDisclosure open={candidate.errors.length > 0 && decision === 'staged'}>
        <ul className="mt-3 space-y-1 text-sm text-negative">
          {candidate.errors.map((error, index) => (
            <li key={`${candidate.id}-error-${index}`}>{error}</li>
          ))}
        </ul>
      </AnimatedDisclosure>

      <AnimatePresence initial={false}>
        {!editing && decision === 'staged' && !revisionOpen && (
          <motion.div
            initial={motionMultiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.14 * motionMultiplier }}
          >
            <Button
              ref={revisionButtonRef}
              className="mt-3"
              size="sm"
              variant="ghost"
              onClick={() => setRevisionOpen(true)}
            >
              Revise with AI
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatedDisclosure open={revisionOpen && decision === 'staged'}>
        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-4">
          <label className="flex flex-col gap-2 text-sm text-ink-soft">
            What should change?
            <textarea
              ref={revisionComplaintRef}
              value={complaint}
              onChange={(event) => setComplaint(event.target.value)}
              rows={3}
              placeholder="Describe the marking or wording problem…"
              className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
            Revised reply
            <textarea
              value={revisedSource}
              onChange={(event) => setRevisedSource(event.target.value)}
              rows={4}
              placeholder="Paste the model's reply here"
              className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-faint focus:border-accent"
            />
          </label>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!complaint.trim()}
              onClick={() => void copyRevisionPrompt()}
            >
              Copy revision prompt
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!revisedSource.trim()}
              onClick={applyRevisedItem}
            >
              Apply revision
            </Button>
          </div>
        </div>
      </AnimatedDisclosure>

      <AnimatedDisclosure open={editing}>
        <div ref={editorRef}>
          <StagedItemEditor candidate={candidate} onCancel={onCancelEdit} onApply={onApplyEdit} />
        </div>
      </AnimatedDisclosure>
    </motion.article>
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
        'rounded-lg px-2.5 py-1 text-xs font-medium capitalize',
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
