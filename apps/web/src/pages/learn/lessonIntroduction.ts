import type { Card } from '@lacuna/core/db/types';
import { markdownAnswerShape } from '../../components/markdown/markdownAnswers';
import { isTypingEligible, typingExpectedAnswer } from '../../utils/answerMode';
import { PREFERRED_TYPING_MAX_CHARACTERS } from '../../utils/resolveAnswerMode';

type Attempt = 'retry' | 'recall' | 'passed';

export interface LessonIntroduction {
  chunks: string[][];
  attempts: [string, Attempt][];
  last?: { cardId: string; first: boolean };
}

const CHUNK_SIZE = 4;

/** Existing structured and untypeable cards keep their established study faces. */
export function canIntroduceCard(card: Card): boolean {
  if (card.sequenceItemId || card.occlusionRegionId || !isTypingEligible(card)) return false;
  const { text, hasVisual } = markdownAnswerShape(typingExpectedAnswer(card));
  return !hasVisual && text.length > 0 && text.length <= PREFERRED_TYPING_MAX_CHARACTERS;
}

export function restoreIntroduction(value: unknown): LessonIntroduction | undefined {
  if (typeof value !== 'object' || value === null) return;
  const state = value as Partial<LessonIntroduction>;
  if (
    !Array.isArray(state.chunks) ||
    !state.chunks.every(
      (chunk) =>
        Array.isArray(chunk) &&
        chunk.length <= CHUNK_SIZE &&
        chunk.every((id) => typeof id === 'string'),
    ) ||
    !Array.isArray(state.attempts) ||
    !state.attempts.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        (entry[1] === 'retry' || entry[1] === 'recall' || entry[1] === 'passed'),
    ) ||
    (state.last !== undefined &&
      (state.last === null ||
        typeof state.last.cardId !== 'string' ||
        typeof state.last.first !== 'boolean'))
  ) {
    return;
  }
  return { chunks: state.chunks, attempts: state.attempts, last: state.last };
}

/** Use the already shuffled queue once. Restored chunk boundaries survive FSRS or pool changes. */
export function prepareIntroduction(
  queue: readonly Card[],
  saved: LessonIntroduction | undefined,
): LessonIntroduction | undefined {
  const previous = saved ?? { chunks: [], attempts: [] };
  const assigned = new Set(previous.chunks.flat());
  const newCards = queue.filter(
    (card) => !assigned.has(card.id) && card.state === 0 && canIntroduceCard(card),
  );
  if (!saved && newCards.length === 0) return;
  const chunks = [...previous.chunks];
  for (let index = 0; index < newCards.length; index += CHUNK_SIZE) {
    chunks.push(newCards.slice(index, index + CHUNK_SIZE).map((card) => card.id));
  }
  return { ...previous, chunks };
}

export function introductionStage(
  introduction: LessonIntroduction | undefined,
  cardId: string,
): 'familiarise' | 'recall' | undefined {
  if (!introduction?.chunks.some((chunk) => chunk.includes(cardId))) return;
  return introduction.attempts.some(([id, attempt]) => id === cardId && attempt !== 'retry')
    ? 'recall'
    : 'familiarise';
}

export function recordIntroductionAttempt(
  introduction: LessonIntroduction,
  cardId: string,
  result: Attempt,
): LessonIntroduction {
  const attempts = new Map(introduction.attempts);
  const first = !attempts.has(cardId);
  attempts.set(cardId, result);
  return { ...introduction, attempts: [...attempts], last: { cardId, first } };
}

export function selectIntroductionCard(
  introduction: LessonIntroduction,
  queue: readonly Card[],
  mastered: ReadonlySet<string>,
): Card | undefined {
  const remaining = queue.filter((card) => !mastered.has(card.id));
  const active = new Set(remaining.map((card) => card.id));
  const attempted = new Map(introduction.attempts);
  const open = new Set<string>();
  let lastOpen: readonly string[] = [];
  for (const [index, chunk] of introduction.chunks.entries()) {
    // A chunk may start after the previous first pass and the penultimate clearance.
    if (introduction.chunks[index - 2]?.some((id) => active.has(id))) break;
    if (introduction.chunks[index - 1]?.some((id) => active.has(id) && !attempted.has(id))) break;
    for (const id of chunk) open.add(id);
    if (chunk.some((id) => active.has(id))) lastOpen = chunk;
  }

  const available = remaining.filter((card) => open.has(card.id));
  if (available.length === 0) {
    const assigned = new Set(introduction.chunks.flat());
    return remaining.find((card) => !assigned.has(card.id));
  }
  // Let learners see the whole first chunk before returning to any of it.
  const firstChunk = introduction.chunks[0];
  const firstPass = available.find(
    (card) => firstChunk.includes(card.id) && !attempted.has(card.id),
  );
  if (firstPass) return firstPass;
  // Open each later chunk as soon as it is admitted, then interleave its new cards.
  if (!lastOpen.some((id) => attempted.has(id))) {
    const opening = available.find((card) => lastOpen.includes(card.id));
    if (opening) return opening;
  }
  const others = available.filter((card) => card.id !== introduction.last?.cardId);
  const options = others.length > 0 ? others : available;
  // Alternate first attempts with recall or retries where both are available.
  return (
    options.find((card) => attempted.has(card.id) === (introduction.last?.first ?? false)) ??
    options[0]
  );
}

export function introductionProgress(
  introduction: LessonIntroduction,
  cardIds: readonly string[],
  mastered: ReadonlySet<string>,
) {
  const sessionCards = new Set(cardIds);
  const completed = new Set(cardIds.filter((id) => mastered.has(id)));
  // A resumed lesson can exclude cards already passed and recorded as exposed.
  for (const [id, attempt] of introduction.attempts) {
    if (attempt === 'passed') {
      sessionCards.add(id);
      completed.add(id);
    }
  }
  return { completed: completed.size, total: sessionCards.size };
}
