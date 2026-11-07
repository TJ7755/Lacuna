import type { Card } from '@lacuna/core/db/types';
import { markdownAnswerShape } from '../../components/markdown/markdownAnswers';
import { lessonDistractorAnswerKey } from '../../jev/protocol';

export interface LessonChoiceCard {
  id: string;
  prompt: string;
  answer: string;
}

function shortPlainText(source: string, maxLength: number) {
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > maxLength || /[\r\n]/.test(trimmed)) return null;
  const { text, hasVisual } = markdownAnswerShape(trimmed);
  return !hasVisual && text === trimmed.replace(/\s+/g, ' ') ? text : null;
}

function distinctText(text: string) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .trim();
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Only compatible, unambiguous cards from the selected lesson can supply choice text. */
export function lessonChoiceCandidates(cards: readonly Card[]): LessonChoiceCard[] {
  const entries: LessonChoiceCard[] = [];
  const promptCounts = new Map<string, number>();
  for (const card of cards) {
    if (card.type === 'cloze' || card.payload || card.sequenceItemId || card.occlusionRegionId) {
      continue;
    }
    const rawPrompt = card.front.trim();
    if (!rawPrompt) continue;
    const { text: prompt, hasVisual } = markdownAnswerShape(rawPrompt);
    if (hasVisual || !prompt || prompt.length > 180) continue;
    const promptKey = distinctText(prompt);
    promptCounts.set(promptKey, (promptCounts.get(promptKey) ?? 0) + 1);
    // Formatted prompts may need the familiarisation face, but can still duplicate plain prompts.
    if (/[\r\n]/.test(rawPrompt) || prompt !== rawPrompt.replace(/\s+/g, ' ')) continue;
    const answer = shortPlainText(card.back, 80);
    if (answer) entries.push({ id: card.id, prompt, answer });
  }
  return entries.filter(({ prompt }) => promptCounts.get(distinctText(prompt)) === 1);
}

export function canOfferChoices(
  target: LessonChoiceCard,
  cards: readonly LessonChoiceCard[],
): boolean {
  const expected = lessonDistractorAnswerKey(target.answer);
  return cards.some((candidate) => lessonDistractorAnswerKey(candidate.answer) !== expected);
}

/** Sample ranked, still-eligible distractors and fill any gaps locally. */
export function lessonChoices(
  target: LessonChoiceCard,
  cards: readonly LessonChoiceCard[],
  rankedIds: readonly string[],
): string[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set([lessonDistractorAnswerKey(target.answer)]);
  const distractors: string[] = [];
  const add = (candidate: LessonChoiceCard | undefined) => {
    if (!candidate || distractors.length === 3) return;
    const key = lessonDistractorAnswerKey(candidate.answer);
    if (seen.has(key)) return;
    seen.add(key);
    distractors.push(candidate.answer);
  };
  for (const id of shuffled(rankedIds)) add(byId.get(id));
  if (distractors.length < 3) {
    for (const candidate of shuffled(cards)) {
      add(candidate);
      if (distractors.length === 3) break;
    }
  }
  return shuffled([target.answer, ...distractors]);
}
