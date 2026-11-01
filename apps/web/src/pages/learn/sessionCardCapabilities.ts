import { CURRENT_ITEM_PAYLOAD_VERSION, type Card } from '../../db/types';

export { isTypingEligible, typingExpectedAnswer } from '../../utils/answerMode';

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
