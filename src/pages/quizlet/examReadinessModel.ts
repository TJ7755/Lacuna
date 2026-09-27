import type { Card, Grade } from '../../db/types';
import { applyReview, makeEngine } from '../../fsrs/fsrs';
import { rAtExam, simContext } from '../../fsrs/forwardSim';
import { defaultFsrsParameters, MS_PER_DAY } from '../../fsrs/params';

export const EXAMPLE_NOW = Date.UTC(2027, 4, 25);
export const EXAMPLE_START = EXAMPLE_NOW - 14 * MS_PER_DAY;
const fsrsParameters = defaultFsrsParameters();
const engine = makeEngine(fsrsParameters);
const context = simContext(
  { id: 'example', examObjective: 'expectedMarks', fsrsParameters },
  engine,
);

interface ReviewExample {
  card: Card;
  reviews: Card[];
}
export interface RecallPoint {
  at: number;
  recall: number;
}

function example(name: string, grades: Grade[]): ReviewExample {
  let card: Card = {
    id: name,
    conceptId: name,
    deckId: 'example',
    schedulingUnitId: 'example',
    type: 'front_back',
    front: name,
    back: '',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: EXAMPLE_START,
    updatedAt: EXAMPLE_START,
  };
  const reviews = [-14, -13, -7].map((day, index) => {
    const at = EXAMPLE_NOW + day * MS_PER_DAY;
    card = { ...card, ...applyReview(engine, card, grades[index], at).memory, updatedAt: at };
    return card;
  });
  return { card, reviews };
}

export const exampleHistories = [
  example('Enzymes', [1, 2, 3]),
  example('Cell structure', [3, 3, 3]),
  example('Diffusion', [4, 4, 4]),
];

function segment(card: Card, start: number, end: number): RecallPoint[] {
  // Extra samples near the review preserve FSRS's steep initial decay at long horizons.
  return Array.from({ length: 65 }, (_, i) => {
    const at = start + (end - start) * (i / 64) ** 2;
    return { at, recall: rAtExam(card, at, EXAMPLE_NOW, context.decay) };
  });
}

export function forecastExample(example: ReviewExample, days: number) {
  const history = example.reviews.flatMap((card, i) =>
    segment(card, card.lastReviewed!, example.reviews[i + 1]?.lastReviewed ?? EXAMPLE_NOW),
  );
  const exam = EXAMPLE_NOW + days * MS_PER_DAY;
  const unreviewed = segment(example.card, EXAMPLE_NOW, exam);
  const afterReview = {
    ...example.card,
    ...applyReview(engine, example.card, 3, EXAMPLE_NOW).memory,
  };
  const reviewed = [unreviewed[0], ...segment(afterReview, EXAMPLE_NOW, exam)];
  const before = unreviewed.at(-1)!.recall;
  const after = reviewed.at(-1)!.recall;
  return { card: example.card, history, reviewed, unreviewed, before, after, gain: after - before };
}
