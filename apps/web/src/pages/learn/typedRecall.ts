import type { Card } from '@lacuna/core/db/types';
import { markdownAnswerCorrect } from '../../components/markdown/markdownAnswers';
import { answerComparisonOptions, type AnswerStrictness } from '../../state/answerStrictness';
import { typingExpectedAnswer } from '../../utils/answerMode';

export function typedComparisonOptions(
  card: Card,
  strictness: AnswerStrictness,
  lessonRequiresCorrectSpelling?: boolean,
) {
  const options = answerComparisonOptions(strictness);
  // The spelling requirement includes punctuation that forms part of a word.
  if (card.requireCorrectSpelling ?? lessonRequiresCorrectSpelling)
    options.ignorePunctuation = false;
  return options;
}

export function matchesTypedRecall(
  card: Card,
  answer: string,
  strictness: AnswerStrictness,
  occlusionAnswerText?: string,
  lessonRequiresCorrectSpelling?: boolean,
): boolean {
  return (
    Boolean(answer.trim()) &&
    markdownAnswerCorrect(typingExpectedAnswer(card, occlusionAnswerText), {
      answer,
      options: typedComparisonOptions(card, strictness, lessonRequiresCorrectSpelling),
    })
  );
}
