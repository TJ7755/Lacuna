import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { QuestionSetChoices } from '../../components/question-sets/QuestionSetChoices';
import '../../components/question-sets/question-set-controls.css';
import { motionTransition } from '../../components/ui/motion';
import { FlowGradeControls } from './FlowGradeControls';
import { lessonChoices, type LessonChoiceCard } from './simpleLearnQuestions';
import { STUDY_VERDICT_HOLD_MS } from './useTypedAutoMark';

// A local choice needs only enough judging time for the ordinary two-sided flip.
const CHOICE_CHECKING_MS = 600;

export function LessonChoiceControls({
  card,
  promptId,
  candidates,
  rankedIds,
  onCheck,
  onAdvance,
  paused,
  departing,
  m,
}: {
  card: LessonChoiceCard;
  promptId: string;
  candidates: readonly LessonChoiceCard[];
  rankedIds: readonly string[];
  onCheck: (correct: boolean) => boolean;
  onAdvance: (correct: boolean) => void;
  paused: boolean;
  departing: boolean;
  m: number;
}) {
  // The presentation owns its choices. A ranking that arrives mid-question is for later cards.
  const [choices] = useState(() => lessonChoices(card, candidates, rankedIds));
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<'checking' | 'correct' | 'incorrect'>();
  const controls = useRef<HTMLDivElement>(null);
  const choiceArea = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const area = choiceArea.current;
    const track = area?.querySelector<HTMLElement>('.qs-choices > div');
    if (!area || !track) return;
    let measuredWidth = 0;

    const measure = () => {
      measuredWidth = parseFloat(getComputedStyle(area).width);
      // Measure the actual pills unwrapped before choosing a layout.
      track.dataset.choiceLayout = 'line';
      const style = getComputedStyle(track);
      if (parseFloat(style.width) <= measuredWidth) return;

      const widths = Array.from(track.children, (label) =>
        parseFloat(getComputedStyle(label).width),
      );
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap);
      const rowWidth = (row: number[]) =>
        row.reduce((sum, width) => sum + width, padding + gap * Math.max(0, row.length - 1));
      const pairWidth = Math.max(rowWidth(widths.slice(0, 2)), rowWidth(widths.slice(2)));

      if (pairWidth <= measuredWidth) {
        track.style.setProperty('--choice-pair-width', `${Math.ceil(pairWidth)}px`);
        track.dataset.choiceLayout = 'pairs';
      } else {
        delete track.dataset.choiceLayout;
      }
    };

    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(([entry]) => {
            if (Math.abs(entry.contentRect.width - measuredWidth) > 0.01) measure();
          });
    observer?.observe(area);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, []);

  const submit = useCallback(() => {
    if (paused || !selected || result) return;
    if (onCheck(selected === card.answer)) setResult('checking');
  }, [paused, selected, result, onCheck, card.answer]);

  useEffect(() => {
    if (paused || !result) return;
    const checking = result === 'checking';
    const timer = window.setTimeout(
      () => {
        if (checking) setResult(selected === card.answer ? 'correct' : 'incorrect');
        else onAdvance(result === 'correct');
      },
      (checking ? CHOICE_CHECKING_MS : STUDY_VERDICT_HOLD_MS) * Math.max(m, 0.3),
    );
    return () => window.clearTimeout(timer);
  }, [paused, result, selected, card.answer, m, onAdvance]);

  useEffect(() => {
    if (paused || result) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      const root = controls.current;
      if (!root || root.closest('[inert], [aria-hidden="true"]')) return;
      let nativeButton: Element | null = null;
      if (target instanceof Element && target !== document.body) {
        if (!root.closest('main')?.contains(target)) return;
        nativeButton = target.closest('button, a, [role="button"]');
        if (nativeButton && !root.contains(nativeButton)) return;
        const radio = target.matches('input[type="radio"]') && root.contains(target);
        if (
          !radio &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]',
          )
        )
          return;
      }

      if (/^[1-4]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        const answer = choices[index];
        if (answer === undefined) return;
        event.preventDefault();
        setSelected(answer);
        root.querySelectorAll<HTMLInputElement>('input[type="radio"]')[index]?.focus({
          preventScroll: true,
        });
      } else if (
        selected &&
        !nativeButton &&
        (event.key === 'Enter' || event.key === ' ' || event.code === 'Space')
      ) {
        event.preventDefault();
        submit();
      }
      // Leave arrows and the first Space to native radio navigation.
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [choices, paused, result, selected, submit]);

  return (
    <div
      ref={controls}
      data-study-choices
      aria-busy={result === 'checking' || undefined}
      className="study-controls study-choice-controls mx-auto mt-6 flex w-full shrink-0 flex-col gap-3"
    >
      <motion.div
        ref={choiceArea}
        onFocus={(event) => event.target.closest('label')?.scrollIntoView({ block: 'nearest' })}
        initial={false}
        animate={{ opacity: result ? 0 : 1 }}
        transition={motionTransition('feedback', m)}
        aria-hidden={result ? true : undefined}
        inert={Boolean(result)}
      >
        <QuestionSetChoices
          label="Choose an answer"
          describedBy={promptId}
          value={selected}
          options={choices.map((answer) => ({ value: answer, label: answer }))}
          onChange={setSelected}
          disabled={Boolean(result)}
          flow
        />
      </motion.div>
      <p role="status" className="sr-only">
        {result === 'correct'
          ? 'Correct.'
          : result === 'incorrect'
            ? `Incorrect. Correct answer: ${card.answer}`
            : ''}
      </p>
      <FlowGradeControls
        question={!result}
        grades={[]}
        rowClassName="w-full"
        revealLabel="Check answer"
        revealDisabled={!selected}
        onReveal={submit}
        autoMark={
          result === 'checking'
            ? { pending: true }
            : result
              ? { pending: false, correct: result === 'correct' }
              : undefined
        }
        departing={departing}
        m={m}
      />
    </div>
  );
}
