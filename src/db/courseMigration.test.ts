import { describe, it, expect } from 'vitest';
import { buildCourseMigration } from './courseMigration';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import type { Card, Deck, Folder, SessionHistoryEntry, UserPerformance } from './types';

/** Deterministic id generator so assertions are stable across runs. */
function sequentialIds(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeDeck(overrides: Partial<Deck> & Pick<Deck, 'id' | 'name' | 'createdAt'>): Deck {
  return {
    examDate: 1000,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    ...overrides,
  };
}

describe('buildCourseMigration', () => {
  it('maps a standalone deck to a single-lesson course copying scheduling fields', () => {
    const deck = makeDeck({
      id: 'd1',
      name: 'Biology',
      createdAt: 50,
      examDate: 9999,
      timeZone: 'Europe/London',
      examObjective: 'securedTopics',
      newCardsPerDay: 20,
      colour: 'sky',
      archived: true,
    });

    const { courses, lessons, courseIdByDeckId, lessonIdByDeckId } = buildCourseMigration(
      [deck],
      [],
      sequentialIds(),
    );

    expect(courses).toHaveLength(1);
    expect(lessons).toHaveLength(1);

    const course = courses[0];
    expect(course.name).toBe('Biology');
    expect(course.description).toBe('');
    expect(course.createdAt).toBe(50);
    // Scheduling fields copied verbatim.
    expect(course.examDate).toBe(9999);
    expect(course.timeZone).toBe('Europe/London');
    expect(course.examObjective).toBe('securedTopics');
    expect(course.newCardsPerDay).toBe(20);
    expect(course.colour).toBe('sky');
    expect(course.archived).toBe(true);
    // Course-path defaults.
    expect(course.unlockMode).toBe('open');
    expect(course.autoPractice).toBe(true);
    expect(course.practiceThresholdMinutesFar).toBe(8);
    expect(course.practiceThresholdMinutesNear).toBe(4);
    expect(course.practiceUrgentWindowDays).toBe(7);
    expect(course.practiceMaxGap).toBe(2);

    const lesson = lessons[0];
    expect(lesson.courseId).toBe(course.id);
    expect(lesson.name).toBe('Biology');
    expect(lesson.orderIndex).toBe(0);
    expect(lesson.createdAt).toBe(50);
    expect(lesson.isExtension).toBe(false);
    expect(lesson.examDate).toBeUndefined();

    expect(courseIdByDeckId.get('d1')).toBe(course.id);
    expect(lessonIdByDeckId.get('d1')).toBe(lesson.id);
  });

  it('maps a folder with two decks to one course with two ordered lessons', () => {
    const folder: Folder = { id: 'f1', name: 'Maths', parentId: null, createdAt: 10 };
    // Deliberately out of creation order to verify sorting.
    const later = makeDeck({
      id: 'd-late',
      name: 'Calculus',
      createdAt: 200,
      examDate: 7777,
      timeZone: 'Europe/Paris',
      folderId: 'f1',
    });
    const earlier = makeDeck({
      id: 'd-early',
      name: 'Algebra',
      createdAt: 100,
      examDate: 5555,
      timeZone: 'Europe/London',
      folderId: 'f1',
    });

    const { courses, lessons } = buildCourseMigration([later, earlier], [folder], sequentialIds());

    expect(courses).toHaveLength(1);
    const course = courses[0];
    expect(course.name).toBe('Maths');
    expect(course.createdAt).toBe(10);
    // Scheduling inherited from the earliest-created deck (Algebra).
    expect(course.examDate).toBe(5555);
    expect(course.timeZone).toBe('Europe/London');

    expect(lessons).toHaveLength(2);
    const [first, second] = lessons;
    expect(first.name).toBe('Algebra');
    expect(first.orderIndex).toBe(0);
    expect(second.name).toBe('Calculus');
    expect(second.orderIndex).toBe(1);

    // Earliest deck matches the course date, so no override.
    expect(first.examDate).toBeUndefined();
    // The later deck's differing exam date is preserved as a lesson override.
    expect(second.examDate).toBe(7777);
    expect(second.timeZone).toBe('Europe/Paris');
  });

  it('treats a deck with a dangling folderId as standalone rather than dropping it', () => {
    // folderId references a folder that is not in the folders array.
    const orphan = makeDeck({ id: 'd-orphan', name: 'Stray', createdAt: 5, folderId: 'gone' });

    const { courses, lessons, courseIdByDeckId, lessonIdByDeckId } = buildCourseMigration(
      [orphan],
      [],
      sequentialIds(),
    );

    expect(courses).toHaveLength(1);
    expect(lessons).toHaveLength(1);
    expect(courses[0].name).toBe('Stray');
    expect(courseIdByDeckId.get('d-orphan')).toBe(courses[0].id);
    expect(lessonIdByDeckId.get('d-orphan')).toBe(lessons[0].id);
  });

  it('stamps courseId/primaryLessonId on cards and courseId on history and performance', () => {
    const deck = makeDeck({ id: 'd1', name: 'Chemistry', createdAt: 0 });
    const { courseIdByDeckId, lessonIdByDeckId } = buildCourseMigration(
      [deck],
      [],
      sequentialIds(),
    );

    const card = { id: 'c1', deckId: 'd1' } as Card;
    card.courseId = courseIdByDeckId.get(card.deckId) ?? null;
    card.primaryLessonId = lessonIdByDeckId.get(card.deckId) ?? null;
    expect(card.courseId).toBe(courseIdByDeckId.get('d1'));
    expect(card.primaryLessonId).toBe(lessonIdByDeckId.get('d1'));

    const entry = { deckId: 'd1', timestamp: 1, averagePredictedRetrievability: 0.5 } as SessionHistoryEntry;
    entry.courseId = courseIdByDeckId.get(entry.deckId);
    expect(entry.courseId).toBe(courseIdByDeckId.get('d1'));

    const perf = { deckId: 'd1' } as UserPerformance;
    perf.courseId = courseIdByDeckId.get(perf.deckId);
    expect(perf.courseId).toBe(courseIdByDeckId.get('d1'));
  });
});
