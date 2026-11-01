import type { AnswerMode, Card, ReviewLog } from '@lacuna/core/db/types';
import type { AnswerInputPreference } from '../state/answerInput';
import { markdownAnswerShape } from '../components/markdown/MarkdownView';
import { splitJevExpectedAnswer } from '../jev/answerParts';
import { JEV_TYPED_MAX_PARTS } from '../jev/protocol';
import { isTypingEligible, typingExpectedAnswer } from './answerMode';

// About a short paragraph: longer answers make repeated typing burdensome.
export const PREFERRED_TYPING_MAX_CHARACTERS = 200;

type AnswerCard = Pick<
  Card,
  'type' | 'payload' | 'answerMode' | 'occlusionRegionId' | 'front' | 'back'
>;

export function resolveAnswerMode(
  card: AnswerCard,
  lessonMode: AnswerMode | undefined,
  preference: AnswerInputPreference,
  occlusionAnswerText?: string,
): AnswerMode {
  const eligible =
    card.occlusionRegionId !== undefined
      ? occlusionAnswerText !== undefined
      : isTypingEligible(card);
  if (!eligible || card.answerMode === 'reveal') return 'reveal';
  if (preference === 'reveal') return 'reveal';
  const suggestion = card.answerMode ?? lessonMode ?? 'reveal';
  if (preference === 'course' || suggestion === 'type') return suggestion;
  const expected = typingExpectedAnswer(card, occlusionAnswerText);
  const { text, hasVisual } = markdownAnswerShape(expected);
  return hasVisual ||
    text.length === 0 ||
    text.length > PREFERRED_TYPING_MAX_CHARACTERS ||
    splitJevExpectedAnswer(text).length > JEV_TYPED_MAX_PARTS
    ? 'reveal'
    : 'type';
}

export function reviewAnswerInput(
  card: Pick<Card, 'payload'>,
  recitation: boolean,
  typing: boolean,
): ReviewLog['input'] {
  if (card.payload || recitation) return undefined;
  return typing ? 'typed' : 'reveal';
}
