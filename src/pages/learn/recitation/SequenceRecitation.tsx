import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownView } from '../../../components/markdown/MarkdownView';
import { Button } from '../../../components/ui/Button';
import { CheckIcon, CloseIcon } from '../../../components/ui/icons';
import { presetForSequence } from '../../../db/sequencePresets';
import type { Sequence } from '../../../db/types';
import { cn } from '../../../components/ui/cn';
import { useRecitationInput } from '../../../state/recitationInput';
import {
  advanceRecitation,
  initialRecitationState,
  isRecitationStateFor,
  presentedLines,
  recitationPlan,
  reviewLines,
  targetLines,
  type RecitationLine,
  type RecitationState,
} from './recitationFlow';

export interface RecitationCheck {
  results: { itemId: string; correct: boolean }[];
  responseTimeSec: number;
  masteredItemIds: string[];
  /** The whole sequence has been recited: every one of its queued lines is learnt. */
  done: boolean;
}

interface Props {
  sequence: Sequence;
  /** Lines already mastered this session, so a resumed pass skips their chunks. */
  masteredItemIds: ReadonlySet<string>;
  onCheck: (check: RecitationCheck) => Promise<void>;
  /**
   * A scheduled review of one due line: its chunk is recited down to it once, and only
   * that line is graded. Replaces the cumulative flow.
   */
  review?: {
    itemId: string;
    onReveal: (lines: number) => void;
    onGrade: (correct: boolean) => void;
  };
  /** Reports the item ids of the lines in focus (the new line, or those being recited). */
  onFocusLines?: (itemIds: string[]) => void;
  /** A step saved by an earlier visit; ignored unless it still fits the sequence. */
  savedState?: unknown;
  /** Reports each new step so it can be saved, or null once the recitation is done. */
  onStateChange?: (state: RecitationState | null) => void;
}

function CueLine({ line }: { line: RecitationLine }) {
  return (
    <div className="text-ink-soft">
      {line.speaker && <div className="text-sm font-medium text-ink">{line.speaker}</div>}
      <MarkdownView source={line.value} />
    </div>
  );
}

/** Cumulative recitation of one lines-mode sequence; see recitationFlow.ts. */
export function SequenceRecitation({
  sequence,
  masteredItemIds,
  onCheck,
  review,
  onFocusLines,
  savedState,
  onStateChange,
}: Props) {
  const plan = useMemo(() => recitationPlan(sequence), [sequence]);
  const [state, setState] = useState<RecitationState>(() =>
    isRecitationStateFor(plan, savedState)
      ? savedState
      : initialRecitationState(plan, masteredItemIds),
  );
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    if (!review) onStateChangeRef.current?.(state.step.kind === 'done' ? null : state);
  }, [state, review]);
  const [input] = useRecitationInput();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const recallStart = useRef(performance.now());
  const rootRef = useRef<HTMLDivElement>(null);

  const { step } = state;
  const phase = review ? 'recall' : state.phase;
  const target = review ? reviewLines(plan, review.itemId) : targetLines(plan, step);
  const mineTarget = target.filter((i) => plan.lines[i].mine);
  const shown = phase === 'present' ? presentedLines(plan, step) : target;
  const terminology = presetForSequence(sequence).terminology;
  const focusKey = shown
    .filter((i) => plan.lines[i].mine)
    .map((i) => plan.lines[i].itemId)
    .join('\n');

  useEffect(() => {
    onFocusLines?.(focusKey ? focusKey.split('\n') : []);
  }, [focusKey, onFocusLines]);

  useEffect(() => {
    if (phase === 'recall' && !checking) recallStart.current = performance.now();
    const focusable = rootRef.current?.querySelector<HTMLElement>('textarea, [data-autofocus]');
    focusable?.focus();
  }, [phase, checking, step]);

  if (step.kind === 'done' && !review) return null;

  const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  const status = review
    ? `Review from the start of the ${terminology.chunkLabel.toLowerCase()}`
    : step.kind === 'join'
      ? `From the top, ${plan.chunks.length > 1 ? `${terminology.chunkLabel.toLowerCase()}s 1 to ${step.upTo + 1}` : 'every line'}`
      : step.kind === 'done'
        ? ''
        : `${plan.chunks.length > 1 ? `${terminology.chunkLabel} ${step.chunk + 1} of ${plan.chunks.length}, ${terminology.item}` : capitalised(terminology.item)} ${step.unlocked} of ${
            plan.chunks[step.chunk].filter((i) => plan.lines[i].mine).length
          }`;

  async function submit() {
    if (saving) return;
    if (phase === 'present') {
      setState(advanceRecitation(plan, state, new Set()).state);
      return;
    }
    if (!checking) {
      // Revealing an answer never grades it: the learner marks any missed lines.
      setWrong(new Set());
      setChecking(true);
      review?.onReveal(mineTarget.length);
      return;
    }
    if (review) {
      review.onGrade(!wrong.has(review.itemId));
      return;
    }
    await record(wrong);
  }

  async function record(wrong: ReadonlySet<string>) {
    setSaving(true);
    const elapsed = (performance.now() - recallStart.current) / 1000;
    const { state: next, mastered } = advanceRecitation(plan, state, wrong);
    try {
      await onCheck({
        results: mineTarget.map((i) => ({
          itemId: plan.lines[i].itemId,
          correct: !wrong.has(plan.lines[i].itemId),
        })),
        responseTimeSec: elapsed / Math.max(1, mineTarget.length),
        masteredItemIds: mastered,
        done: next.step.kind === 'done',
      });
    } finally {
      setSaving(false);
    }
    setState(next);
    setTyped({});
    setWrong(new Set());
    setChecking(false);
  }

  function toggleWrong(itemId: string) {
    setWrong((previous) => {
      const next = new Set(previous);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });
  }

  const nextMine = (index: number) => mineTarget.find((i) => i > index);
  const action =
    phase === 'present'
      ? 'Recite'
      : !checking
        ? 'Check'
        : review
          ? 'Continue'
          : wrong.size > 0
            ? 'Try again'
            : 'All correct';

  return (
    <div
      ref={rootRef}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-line bg-surface px-6 py-8 md:px-10 md:py-10"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.target instanceof HTMLTextAreaElement)
          return;
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="sr-only">{sequence.name}</h2>
      <p className="sr-only">{status}</p>

      <ol
        className="flex flex-col gap-3"
        aria-label={phase === 'present' ? 'New line' : 'Recitation'}
      >
        {shown.map((index) => {
          const line = plan.lines[index];
          if (!line.mine) {
            return (
              <li key={line.itemId}>
                <CueLine line={line} />
              </li>
            );
          }
          const position = mineTarget.indexOf(index) + 1;
          if (phase === 'present') {
            return (
              <li key={line.itemId} className="text-lg text-ink">
                <MarkdownView source={line.value} />
              </li>
            );
          }
          if (!checking) {
            return (
              <li key={line.itemId}>
                {input === 'type' ? (
                  <textarea
                    aria-label={`${terminology.item} ${position}`}
                    rows={1}
                    value={typed[line.itemId] ?? ''}
                    onChange={(event) => setTyped({ ...typed, [line.itemId]: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
                        return;
                      event.preventDefault();
                      const next = nextMine(index);
                      const field =
                        next === undefined
                          ? null
                          : rootRef.current?.querySelector<HTMLElement>(
                              `textarea[data-line="${plan.lines[next].itemId}"]`,
                            );
                      if (field) field.focus();
                      else void submit();
                    }}
                    data-line={line.itemId}
                    className="w-full resize-none rounded-lg border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition-colors [field-sizing:content] focus:border-accent"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-line px-4 py-3 text-ink-faint">
                    {terminology.item} {position}
                  </div>
                )}
              </li>
            );
          }
          const isWrong = wrong.has(line.itemId);
          const answer = typed[line.itemId];
          return (
            <li key={line.itemId}>
              <button
                type="button"
                aria-pressed={isWrong}
                aria-label={`${terminology.item} ${position}: ${isWrong ? 'marked wrong' : 'correct'}`}
                onClick={() => toggleWrong(line.itemId)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors',
                  isWrong ? 'bg-negative/10 hover:bg-negative/15' : 'hover:bg-ink/5',
                )}
              >
                <div className="min-w-0 flex-1 text-ink">
                  {input === 'type' && answer && (
                    <p className="mb-2 whitespace-pre-wrap text-ink-soft">{answer}</p>
                  )}
                  <MarkdownView source={line.value} />
                </div>
                {isWrong ? (
                  <CloseIcon
                    width={18}
                    height={18}
                    className="mt-1 shrink-0 text-negative"
                    aria-hidden
                  />
                ) : (
                  <CheckIcon
                    width={18}
                    height={18}
                    className="mt-1 shrink-0 text-positive"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col items-center gap-3">
        {checking && <p className="text-sm text-ink-soft">Tap any line you missed.</p>}
        <Button
          variant={checking && wrong.size > 0 && !review ? 'secondary' : 'primary'}
          size="lg"
          className="w-full max-w-[13.5rem]"
          data-autofocus={input === 'aloud' || phase === 'present' || checking ? true : undefined}
          disabled={saving}
          onClick={() => void submit()}
        >
          {action}
        </Button>
      </div>
    </div>
  );
}
