// Card type picker for the card editor, drawn as a pill segmented control. It is the
// one place to choose what to make: the everyday types show first, and More reveals
// the rarer ones and the kinds with editors of their own (sequence, image occlusion).
// Import stays beside the track, available without opening More.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PillToggleGroup, type PillToggleOption } from './PillToggleGroup';
import type { CardType } from '../../db/types';

/** Authoring types: the stored card types plus the structured and audio variants. */
export type EditorCardType = CardType | 'numeric' | 'working' | 'audio';

type PickerValue = EditorCardType | 'sequence' | 'occlusion';

const EVERYDAY_TYPES = [
  { value: 'front_back', label: 'Front / back' },
  { value: 'cloze', label: 'Cloze deletion' },
] as const satisfies readonly PillToggleOption<EditorCardType>[];

const MORE_TYPES = [
  { value: 'basic_reversed', label: 'Basic (reversed)' },
  { value: 'numeric', label: 'Numeric answer' },
  { value: 'working', label: 'Working' },
  { value: 'audio', label: 'Audio' },
] as const satisfies readonly PillToggleOption<EditorCardType>[];

/** Every editor type, in picker order. Lets a form transition move the way the pill did. */
export const EDITOR_TYPE_ORDER: readonly EditorCardType[] = [...EVERYDAY_TYPES, ...MORE_TYPES].map(
  (option) => option.value,
);

const TYPE_HELP: Partial<Record<EditorCardType, string>> = {
  basic_reversed: 'Practise both directions: the answer also becomes a prompt.',
  cloze: 'Recall a hidden word or phrase, for example: Water is {{c1::H2O}}.',
  numeric: 'Check a number or expression, for example: 8 / 2 = 4.',
  working: 'Check each step against a mark scheme, for example: [1] answer :: equals :: 4.',
  audio: 'Listen to a clip, then recall its answer. Choose a file or explicitly start recording.',
};

function isEveryday(type: EditorCardType) {
  return EVERYDAY_TYPES.some((option) => option.value === type);
}

export function CardTypePicker({
  value,
  onChange,
  onNewSequence,
  onNewOcclusion,
  sources,
}: {
  value: EditorCardType;
  onChange: (type: EditorCardType) => void;
  /** Offered among the further types; opens the sequence editor instead. */
  onNewSequence?: () => void;
  /** Offered among the further types; opens the image-occlusion editor instead. */
  onNewOcclusion?: () => void;
  /** Existing-card actions beside the track; further actions can follow More. */
  sources?: (revealed: boolean) => ReactNode;
}) {
  const [more, setMore] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // More leaves as the further types arrive, so its focus passes to the first of them.
  const focusRevealed = useRef(false);
  useEffect(() => {
    if (!more || !focusRevealed.current) return;
    focusRevealed.current = false;
    rootRef.current
      ?.querySelectorAll<HTMLElement>('[aria-pressed]')
      [EVERYDAY_TYPES.length]?.focus();
  }, [more]);
  // A card already of a rarer type shows its type rather than hiding it behind More.
  const revealed = more || !isEveryday(value);
  const options: PillToggleOption<PickerValue>[] = [...EVERYDAY_TYPES];
  if (revealed) {
    options.push(...MORE_TYPES);
    if (onNewSequence) options.push({ value: 'sequence', label: 'Sequence' });
    if (onNewOcclusion) options.push({ value: 'occlusion', label: 'Image occlusion' });
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      <PillToggleGroup<PickerValue>
        label="Card type"
        className="shrink-0"
        options={options}
        value={value}
        onChange={(next) => {
          if (next === 'sequence') onNewSequence?.();
          else if (next === 'occlusion') onNewOcclusion?.();
          else onChange(next);
        }}
        onMore={
          revealed
            ? undefined
            : () => {
                focusRevealed.current = true;
                setMore(true);
              }
        }
        moreLabel="More card types"
      />
      {sources?.(revealed)}
      {TYPE_HELP[value] && <p className="basis-full text-sm text-ink-soft">{TYPE_HELP[value]}</p>}
    </div>
  );
}
