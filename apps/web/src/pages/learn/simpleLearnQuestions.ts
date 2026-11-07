import type { Card } from '@lacuna/core/db/types';
import { markdownAnswerShape } from '../../components/markdown/markdownAnswers';

interface ChoiceCard {
  prompt: string;
  answer: string;
}

interface ChoiceGroup {
  entries: ChoiceCard[];
  promptCounts: Map<string, number>;
}

export interface SimpleLearnQuestion extends ChoiceCard {
  choices: string[];
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
    .replace(/[.!?]+$/, '');
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Generate recognition questions from distinct short answers in the same lesson. */
export function buildSimpleLearnQuestions(
  cards: readonly Card[],
  lessonScoped: boolean,
): SimpleLearnQuestion[] {
  const groups = new Map<string | null, ChoiceGroup>();
  for (const card of cards) {
    if (
      card.type !== 'front_back' ||
      card.payload ||
      card.sequenceItemId ||
      card.occlusionRegionId
    ) {
      continue;
    }
    const rawPrompt = card.front.trim();
    if (!rawPrompt) continue;
    const { text: prompt, hasVisual } = markdownAnswerShape(rawPrompt);
    if (hasVisual || !prompt || prompt.length > 180) continue;
    const groupKey = lessonScoped ? null : (card.primaryLessonId ?? null);
    let group = groups.get(groupKey);
    if (!group) {
      group = { entries: [], promptCounts: new Map() };
      groups.set(groupKey, group);
    }
    const promptKey = distinctText(prompt);
    group.promptCounts.set(promptKey, (group.promptCounts.get(promptKey) ?? 0) + 1);
    // Formatting may be needed to understand a prompt, but it can still duplicate plain text.
    if (/[\r\n]/.test(rawPrompt) || prompt !== rawPrompt.replace(/\s+/g, ' ')) continue;
    const answer = shortPlainText(card.back, 80);
    if (answer) group.entries.push({ prompt, answer });
  }

  const questions: SimpleLearnQuestion[] = [];
  for (const { entries, promptCounts } of groups.values()) {
    // Repeated prompts can represent alternate valid answers. Skip them entirely.
    const eligible = entries.filter(({ prompt }) => promptCounts.get(distinctText(prompt)) === 1);
    const answers = shuffled([
      ...new Map(eligible.map(({ answer }) => [distinctText(answer), answer])),
    ]);
    if (answers.length < 2) continue;
    eligible.forEach((entry, index) => {
      const key = distinctText(entry.answer);
      const distractors: string[] = [];
      for (let offset = 0; offset < answers.length && distractors.length < 3; offset += 1) {
        const [candidate, answer] = answers[(index + offset) % answers.length];
        if (candidate !== key) distractors.push(answer);
      }
      questions.push({ ...entry, choices: shuffled([entry.answer, ...distractors]) });
    });
  }
  return shuffled(questions);
}

export function retrySimpleLearnQuestion(question: SimpleLearnQuestion): SimpleLearnQuestion {
  return { ...question, choices: shuffled(question.choices) };
}
