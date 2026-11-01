import { PillToggleGroup } from '../cards/PillToggleGroup';
import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { useLayoutEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { Lesson } from '@lacuna/core/db/types';
import type { QuestionDefinition } from '@lacuna/core/questions/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { buildBatchGenerationPrompt } from '../../items/prompts';
import { ItemStagingReview } from './ItemStagingReview';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { StepSwap, stepSwapTiming } from '../ui/StepSwap';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

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
    <DialogPanel
      label="Generate Question batch"
      trapRef={trapRef}
      backdropProps={{ 'data-testid': 'batch-authoring-backdrop' }}
      className={cn('max-h-[90vh]', mode === 'review' ? 'max-w-5xl' : 'max-w-2xl')}
      overlayClassName="will-change-transform-opacity"
      layout
      onKeyDown={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          requestClose();
        }
      }}
    >
      <DialogHeader title="Author Question batch" onClose={requestClose} closeLabel="Close" />

      <div className="relative border-b border-line px-6 py-3">
        <PillToggleGroup
          label="Batch authoring step"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'prompt', label: 'Build prompt' },
            { value: 'review', label: 'Review response' },
          ]}
        />
      </div>

      <motion.div
        layout={multiplier > 0 ? 'position' : undefined}
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
              <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                Lesson notes
                <textarea
                  value={notes}
                  ref={notesRef}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={6}
                  placeholder="Paste the notes for one lesson or topic…"
                  className={`${inputFrameClassName} resize-y placeholder:text-ink-faint`}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                  Topic
                  <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Demand"
                    className={`${inputFrameClassName} placeholder:text-ink-faint`}
                  />
                </label>
                <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                  Level
                  <input
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    placeholder="A level"
                    className={`${inputFrameClassName} placeholder:text-ink-faint`}
                  />
                </label>
              </div>

              <div className="rounded-2xl bg-ink/[0.04] px-4 py-3">
                <p className="text-sm font-medium text-ink">Concept checks, not worksheets</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Working items should test a reusable method or derivation. Use symbolic general
                  forms where possible; arbitrary-number exercise variants are not supported yet.
                </p>
              </div>

              <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-ink-soft">
                <Toggle
                  checked={showConstraints}
                  onChange={setShowConstraints}
                  label="Set generation constraints"
                />
              </div>

              <AnimatedDisclosure open={showConstraints}>
                <div className="grid gap-4 pt-0.5">
                  <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                    Maximum items <span className="text-xs text-ink-faint">Optional</span>
                    <input
                      type="number"
                      min={1}
                      value={maxItems}
                      placeholder="No limit"
                      onChange={(event) =>
                        setMaxItems(event.target.value === '' ? '' : Number(event.target.value))
                      }
                      className={`${inputFrameClassName} `}
                    />
                  </label>
                </div>
              </AnimatedDisclosure>
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
    </DialogPanel>
  );
}
