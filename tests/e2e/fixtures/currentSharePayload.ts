interface FixtureCard {
  co?: string;
  [key: string]: unknown;
}

interface FixtureLesson {
  i?: string;
  n: string;
  cards: FixtureCard[];
  [key: string]: unknown;
}

interface FixturePayload {
  lessons: FixtureLesson[];
  concepts?: Array<{ id: string; n: string }>;
  questions?: unknown[];
  questionSets?: unknown[];
  questionSetPracticeNodes?: unknown[];
  [key: string]: unknown;
}

/**
 * Completes a compact course fixture as a v6 share payload: imports only accept v6, whose
 * cards each reference a Concept. Cards without one join a Concept named after their lesson.
 */
export function currentSharePayload<T extends FixturePayload>(payload: T) {
  const concepts = [...(payload.concepts ?? [])];
  const lessons = payload.lessons.map((lesson, index) => {
    if (lesson.cards.every((card) => card.co)) return lesson;
    const id = `${lesson.i ?? `lesson-${index}`}-concept`;
    concepts.push({ id, n: lesson.n });
    return { ...lesson, cards: lesson.cards.map((card) => ({ co: id, ...card })) };
  });
  return {
    ...payload,
    v: 6 as const,
    lessons,
    concepts,
    questions: payload.questions ?? [],
    questionSets: payload.questionSets ?? [],
    questionSetPracticeNodes: payload.questionSetPracticeNodes ?? [],
  };
}
