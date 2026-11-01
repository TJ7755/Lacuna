import { db } from './schema';
import type { SharePayloadV6 } from './share';

export async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.occlusions.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.questionSets.clear(),
    db.tombstones.clear(),
  ]);
}

export function v1Payload(): unknown {
  return {
    v: 1,
    by: null,
    at: Date.now(),
    decks: [{ n: 'Old deck', o: 0, c: 0, e: 0, cards: [{ k: 0, f: 'Q', b: 'A' }] }],
  };
}

export function currentPayload(
  cards: Array<{ k: 0 | 1 | 2 | 3; f: string; b?: string }> = [{ k: 0, f: 'Q', b: 'A' }],
): SharePayloadV6 {
  return {
    v: 6,
    concepts: cards.map((card, index) => ({ id: `concept-${index}`, n: card.f })),
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
    by: null,
    at: Date.now(),
    course: { n: 'Shared', o: 0, c: 0, e: 0, um: 'open' },
    lessons: [
      {
        n: 'Lesson',
        notes: [],
        cards: cards.map((card, index) => ({ ...card, co: `concept-${index}` })),
      },
    ],
  };
}
