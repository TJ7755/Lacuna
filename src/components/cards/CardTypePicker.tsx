// Card type picker for the card editor, drawn as a pill segmented control.

import { PillToggleGroup } from './PillToggleGroup';
import type { CardType } from '../../db/types';

/** Authoring types: the stored card types plus the structured and audio variants. */
export type EditorCardType = CardType | 'numeric' | 'working' | 'audio';

const TYPE_OPTIONS = [
  { value: 'front_back', label: 'Front / Back' },
  { value: 'cloze', label: 'Cloze deletion' },
  { value: 'basic_reversed', label: 'Basic (reversed)' },
  { value: 'numeric', label: 'Numeric answer' },
  { value: 'working', label: 'Working' },
  { value: 'audio', label: 'Audio' },
] as const satisfies readonly { value: EditorCardType; label: string }[];

export function CardTypePicker({
  value,
  onChange,
}: {
  value: EditorCardType;
  onChange: (type: EditorCardType) => void;
}) {
  return <PillToggleGroup label="Card type" options={TYPE_OPTIONS} value={value} onChange={onChange} />;
}
