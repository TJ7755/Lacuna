import { useLayoutEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { Lesson } from '../../db/types';
import type { QuestionDefinition } from '../../questions/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { buildBatchGenerationPrompt } from '../../items/prompts';
import { ItemStagingReview } from './ItemStagingReview';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import { CloseIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { StepSwap, stepSwapTiming } from '../ui/StepSwap';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';

interface BatchAuthoringPromptDialogProps {
  courseId: string;
  courseName: string;
  examBoard?: string;
  specification?: string;
  lessons: Lesson[];
  questions: QuestionDefinition[];
  onClose: () => void;
}

export function BatchAuthoringPromptDialog({
  courseId,
  courseName,
  examBoard,
  specification,
  lessons,
  questions,
  onClose,
}: BatchAuthoringPromptDialogProps) {
  const { notify } = useToast();
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'textarea' });
  const [notes, setNotes] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [showConstraints, setShowConstraints] = useState(false);
  const [maxItems, setMaxItems] = useState<number | ''>('');
  const [mode, setMode] = useState<'prompt' | 'review'>('prompt');
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const reviewSourceRef = useRef<HTMLTextAreaElement>(null);
  const canCopy = notes.trim().length > 0 && topic.trim().length > 0 && level.trim().length > 0;
  const hasDraft =
    notes.trim().length > 0 || topic.trim().length > 0 || level.trim().length > 0 || reviewDirty;

  useLayoutEffect(() => {
    (mode === 'review' ? reviewSourceRef : notesRef).current?.focus();
  }, [mode]);

  function requestClose() {
    if (hasDraft) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function copyPrompt() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(
        buildBatchGenerationPrompt({
          notes,
          topic,
          level,
          examBoard,
          specification,
          maxItems: showConstraints && maxItems !== '' ? maxItems : undefined,
        }),
      );
      notify('Question batch prompt copied to the clipboard.', 'positive');
    } catch {
      notify('Could not copy the batch prompt.', 'negative');
    }
  }

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col will-change-transform-opacity"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          requestClose();
        }
      }}
    >
      <div
        data-testid="batch-authoring-backdrop"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Generate Question batch"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        layout={multiplier > 0 ? 'size' : undefined}
        transition={scaledSpring(multiplier, 320, 30)}
        className={cn(
          'relative z-10 m-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20',
          mode === 'review' ? 'max-w-5xl' : 'max-w-2xl',
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-dot-grid opacity-20"
          aria-hidden="true"
        />
        <header className="relative flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-2xl">Author Question batch</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {mode === 'prompt'
                ? `Build a prompt for ${courseName}.`
                : `Review generated Questions before adding them to ${courseName}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            title="Close (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div
          className="relative flex gap-1 border-b border-line px-6 py-3"
          role="tablist"
          aria-label="Batch authoring step"
        >
          {(
            [
              ['prompt', 'Build prompt'],
              ['review', 'Review response'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'min-h-11 rounded-lg px-4 text-sm font-medium transition-colors',
                mode === value
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <motion.div
          layout={multiplier > 0 ? 'size' : undefined}
          transition={stepSwapTiming(multiplier)}
          className="relative overflow-y-auto"
        >
          <StepSwap
            stepKey={mode}
            direction={mode === 'review' ? 1 : -1}
            className="flex flex-col gap-5 px-6 py-6"
          >
            {mode === 'review' ? (
              <ItemStagingReview
                courseId={courseId}
                lessons={lessons}
                questions={questions}
                onDirtyChange={setReviewDirty}
                sourceInputRef={reviewSourceRef}
              />
            ) : (
              <>
                <label className="flex flex-col gap-2 text-sm text-ink-soft">
                  Lesson notes
                  <textarea
                    value={notes}
                    ref={notesRef}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={6}
                    placeholder="Paste the notes for one lesson or topic…"
                    className="resize-y rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-ink-soft">
                    Topic
                    <input
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder="Demand"
                      className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-ink-soft">
                    Level
                    <input
                      value={level}
                      onChange={(event) => setLevel(event.target.value)}
                      placeholder="A level"
                      className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-accent/25 bg-accent-soft/45 px-4 py-3">
                  <p className="text-sm font-medium text-ink">Concept checks, not worksheets</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    Working items should test a reusable method or derivation. Use symbolic general
                    forms where possible; arbitrary-number exercise variants are not supported yet.
                  </p>
                </div>

                <label className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    aria-label="Set generation constraints"
                    checked={showConstraints}
                    onChange={(event) => setShowConstraints(event.target.checked)}
                    className="accent-accent"
                  />
                  <span className="font-medium text-ink">Set generation constraints</span>
                  <span className="ml-auto text-xs text-ink-faint">
                    Otherwise the model chooses
                  </span>
                </label>

                <AnimatedDisclosure open={showConstraints}>
                  <div className="grid gap-4 pt-0.5">
                    <label className="flex flex-col gap-2 text-sm text-ink-soft">
                      Maximum items <span className="text-xs text-ink-faint">Optional</span>
                      <input
                        type="number"
                        min={1}
                        value={maxItems}
                        placeholder="No limit"
                        onChange={(event) =>
                          setMaxItems(event.target.value === '' ? '' : Number(event.target.value))
                        }
                        className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-ink outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                </AnimatedDisclosure>

                <p className="text-xs leading-relaxed text-ink-faint">
                  Lacuna copies a prompt only. Continue the conversation in your chosen chatbot,
                  then paste its structured response into the staging review.
                </p>
              </>
            )}
          </StepSwap>
        </motion.div>

        <AnimatedDisclosure open={mode === 'prompt'}>
          <footer className="relative flex justify-end gap-2 border-t border-line px-6 py-4">
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canCopy} onClick={() => void copyPrompt()}>
              Copy Question batch prompt
            </Button>
          </footer>
        </AnimatedDisclosure>
        <AnimatedDisclosure open={confirmClose}>
          <div className="relative border-t border-warning/30 bg-warning/5 px-6 py-4">
            <ConfirmInline
              message="Discard this unsaved Question batch prompt and staging review?"
              confirmLabel="Discard batch"
              announce
              focusOnMount="cancel"
              onCancel={() => setConfirmClose(false)}
              onConfirm={onClose}
            />
          </div>
        </AnimatedDisclosure>
      </motion.div>
    </motion.div>
  );
}
