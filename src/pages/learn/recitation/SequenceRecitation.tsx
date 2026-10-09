import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownView } from '../../../components/markdown/MarkdownView';
import { Button } from '../../../components/ui/Button';
import { presetForSequence } from '../../../db/sequencePresets';
import type { Sequence } from '../../../db/types';
import type { AnswerComparisonOptions } from '../../../utils/answerComparison';
import { cn } from '../../../components/ui/cn';
import { useRecitationInput } from '../../../state/recitationInput';
import {
  advanceRecitation,
  initialRecitationState,
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
  comparison: AnswerComparisonOptions;
  onCheck: (check: RecitationCheck) => Promise<void>;
  /**
   * A scheduled review of one due line: its chunk is recited down to it once, and only
   * that line is graded. Replaces the cumulative flow.
   */
  review?: { itemId: string; onReveal: (lines: number) => void; onGrade: (correct: boolean) => void };
}

function CueLine({ line }: { line: RecitationLine }) {
  return (
    <div className="text-ink-soft">
      {line.speaker && (
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">{line.speaker}</span>
      )}
      <MarkdownView source={line.value} />
    </div>
  );
}

/** Cumulative recitation of one lines-mode sequence; see recitationFlow.ts. */
export function SequenceRecitation({ sequence, masteredItemIds, comparison, onCheck, review }: Props) {
  const plan = useMemo(() => recitationPlan(sequence), [sequence]);
  const [state, setState] = useState<RecitationState>(() =>
    initialRecitationState(plan, masteredItemIds),
  );
  const [input, setInput] = useRecitationInput();
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

  useEffect(() => {
    if (phase === 'recall' && !checking) recallStart.current = performance.now();
    const focusable = rootRef.current?.querySelector<HTMLElement>('textarea, [data-autofocus]');
    focusable?.focus();
  }, [phase, checking, step]);

  if (step.kind === 'done' && !review) return null;

  const status = review
    ? 'Review'
    : step.kind === 'join'
      ? `From the top · ${plan.chunks.length > 1 ? `${terminology.chunkLabel}s 1–${step.upTo + 1}` : 'all lines'}`
      : step.kind === 'done'
        ? ''
        : `${terminology.chunkLabel} ${step.chunk + 1} of ${plan.chunks.length} · ${terminology.item} ${step.unlocked} of ${
          plan.chunks[step.chunk].filter((i) => plan.lines[i].mine).length
        }`;

  async function submit() {
    if (saving) return;
    if (phase === 'present') {
      setState(advanceRecitation(plan, state, new Set()).state);
      return;
    }
    if (!checking) {
      setChecking(true);
      review?.onReveal(mineTarget.length);
      return;
    }
    if (review) {
      review.onGrade(!wrong.has(review.itemId));
      return;
    }
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
      className="mx-auto flex w-full max-w-2xl flex-col gap-6"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.target instanceof HTMLTextAreaElement) return;
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
        <span>{sequence.name}</span>
        <span>{status}</span>
      </div>

      <ol className="flex flex-col gap-3" aria-label={phase === 'present' ? 'New line' : 'Recitation'}>
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
                      if (event.key !== 'Enter' || event.shiftKey) return;
                      event.preventDefault();
                      const next = nextMine(index);
                      const field = next === undefined ? null : rootRef.current?.querySelector<HTMLElement>(
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
                  'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                  isWrong
                    ? 'border-negative/50 bg-negative/10'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <MarkdownView
                  source={line.value}
                  className="text-ink"
                  typedAnswerFeedback={
                    input === 'type' ? { answer: answer ?? '', options: comparison } : undefined
                  }
                />
                {input === 'type' && (
                  <div className="mt-1 text-sm text-ink-faint">{answer?.trim() || 'No answer'}</div>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col items-center gap-3">
        {checking && (
          <p className="text-sm text-ink-soft">
            {wrong.size > 0 && !review
              ? `Recite from the start of this ${step.kind === 'join' ? 'pass' : terminology.chunkLabel.toLowerCase()} again.`
              : 'Tap any line you got wrong.'}
          </p>
        )}
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
        {phase === 'recall' && !checking && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInput(input === 'type' ? 'aloud' : 'type')}
          >
            {input === 'type' ? 'Say it aloud instead' : 'Type instead'}
          </Button>
        )}
      </div>
    </div>
  );
}
