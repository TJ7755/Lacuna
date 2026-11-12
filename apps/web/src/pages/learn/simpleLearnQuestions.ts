import type { Card } from '@lacuna/core/db/types';
import { markdownAnswerShape } from '../../components/markdown/markdownAnswers';
import {
  prepareNumericAnswer,
  renderMarkdownToHtml,
} from '../../components/markdown/markdownRenderer';
import maths from '../../components/markdown/optionalMarkdownMath';
import { lessonDistractorAnswerKey } from '../../jev/protocol';

export interface LessonChoiceCard {
  id: string;
  prompt: string;
  answer: string;
}

function shortChoiceSource(source: string, maxLength: number) {
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > maxLength || /[\r\n]/.test(trimmed)) return null;
  const { text, hasVisual } = markdownAnswerShape(trimmed);
  return !hasVisual && text && text.length <= maxLength ? trimmed : null;
}

function renderedChoiceIdentity(source: string) {
  const body = new DOMParser().parseFromString(
    renderMarkdownToHtml(prepareNumericAnswer(source), false, false, { math: maths }),
    'text/html',
  ).body;
  // KaTeX's text includes the authored TeX annotation. Compare its MathML instead,
  // keeping superscripts distinct from subscripts and equivalent braces equal.
  for (const formula of body.querySelectorAll('.katex')) {
    formula.querySelectorAll('annotation').forEach((annotation) => annotation.remove());
    formula.replaceWith(
      `\uFFFC${formula.querySelector('math')?.outerHTML ?? formula.textContent}\uFFFC`,
    );
  }
  return body.textContent ?? '';
}

function choiceAnswerKey(source: string) {
  return lessonDistractorAnswerKey(renderedChoiceIdentity(source));
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
    const promptKey = distinctText(renderedChoiceIdentity(rawPrompt));
    promptCounts.set(promptKey, (promptCounts.get(promptKey) ?? 0) + 1);
    if (/[\r\n]/.test(rawPrompt) || rawPrompt.length > 180) continue;
    const answer = shortChoiceSource(card.back, 80);
    if (answer) entries.push({ id: card.id, prompt: rawPrompt, answer });
  }
  return entries.filter(
    ({ prompt }) => promptCounts.get(distinctText(renderedChoiceIdentity(prompt))) === 1,
  );
}

export function canOfferChoices(
  target: LessonChoiceCard,
  cards: readonly LessonChoiceCard[],
): boolean {
  const expected = choiceAnswerKey(target.answer);
  return cards.some((candidate) => choiceAnswerKey(candidate.answer) !== expected);
}

/** Sample ranked, still-eligible distractors and fill any gaps locally. */
export function lessonChoices(
  target: LessonChoiceCard,
  cards: readonly LessonChoiceCard[],
  rankedIds: readonly string[],
): string[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set([choiceAnswerKey(target.answer)]);
  const distractors: string[] = [];
  const add = (candidate: LessonChoiceCard | undefined) => {
    if (!candidate || distractors.length === 3) return;
    const key = choiceAnswerKey(candidate.answer);
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
