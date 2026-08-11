import { clozeAnswerText } from '../../components/markdown/cloze';
import { CURRENT_ITEM_PAYLOAD_VERSION, type Card } from '../../db/types';

/** Whether the configured typing presentation can answer this ordinary card. */
export function isTypingEligible(card: Pick<Card, 'type' | 'payload'>): boolean {
  return (
    card.payload === undefined &&
    (card.type === 'front_back' || card.type === 'basic_reversed' || card.type === 'cloze')
  );
}

/** Resolve the text used to compare a typed answer. */
export function typingExpectedAnswer(
  card: Pick<Card, 'type' | 'front' | 'back'>,
  occlusionAnswerText?: string,
): string {
  if (occlusionAnswerText !== undefined) return occlusionAnswerText;
  return card.type === 'cloze' ? clozeAnswerText(card.front) : card.back;
}

export function hasMachineMarkedPayload(card: Pick<Card, 'payload'> | null): boolean {
  return (
    card?.payload?.v === CURRENT_ITEM_PAYLOAD_VERSION &&
    (card.payload.kind === 'numeric' || card.payload.kind === 'working')
  );
}

/** Whether a payload exists but this client cannot render its study face. */
export function isUnrenderableItemPayload(card: Pick<Card, 'payload'> | null): boolean {
  return !!card?.payload && !hasMachineMarkedPayload(card);
}
