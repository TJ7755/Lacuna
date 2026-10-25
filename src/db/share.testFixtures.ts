import { db } from './schema';
import type { SharePayload, SharePayloadV1 } from './share';

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

export function v1Payload(): SharePayloadV1 {
  return {
    v: 1,
    by: null,
    at: Date.now(),
    decks: [{ n: 'Old deck', o: 0, c: 0, e: 0, cards: [{ k: 0, f: 'Q', b: 'A' }] }],
  };
}

export function v2Payload(
  cards: Array<{ k: 0 | 1 | 2 | 3; f: string; b?: string }> = [{ k: 0, f: 'Q', b: 'A' }],
): SharePayload {
  return {
    v: 2,
    by: null,
    at: Date.now(),
    course: { n: 'Shared', o: 0, c: 0, e: 0, um: 'open' },
    lessons: [{ n: 'Lesson', notes: [], cards }],
  };
}
