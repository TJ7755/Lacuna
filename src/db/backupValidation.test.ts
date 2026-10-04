import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createNote,
  recordReview,
} from './repository';
import { exportDatabase, importBackup, readBackupFile, validateBackup } from './portability';

describe('backup record validation', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.tables, () =>
      Promise.all(db.tables.map((table) => table.clear())),
    );
  });

  it.each(['replace', 'merge'] as const)(
    'rejects a malformed lesson before any %s writes',
    async (mode) => {
      const course = await createCourse('Retained library');
      const lesson = await createLesson(course.id, 'Retained lesson');
      await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
      const backup = await exportDatabase();
      const before = await Promise.all(db.tables.map((table) => table.toArray()));
      const malformed = { ...backup, lessons: [{ ...backup.lessons![0], id: undefined }] };

      expect(validateBackup(malformed)).toBe(false);
      await expect(importBackup(malformed as unknown as typeof backup, mode)).rejects.toThrow(
        /lessons\[0\]\.id/,
      );
      expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
      await expect(
        readBackupFile(new File([JSON.stringify(malformed)], 'backup.json')),
      ).rejects.toThrow(/lessons\[0\]\.id/);
    },
  );

  it('accepts current exports and supported older records without rewriting unknown fields', async () => {
    const course = await createCourse('Older backup');
    const lesson = await createLesson(course.id, 'Lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    const current = await exportDatabase();
    expect(validateBackup(current)).toBe(true);
    const older = {
      ...current,
      app: 'lacuna',
      version: 9,
      concepts: undefined,
      questions: undefined,
      questionConcepts: undefined,
      questionAttempts: undefined,
      lessons: current.lessons?.map(({ updatedAt: _updatedAt, ...row }) => row),
      cards: current.cards.map(({ conceptId: _conceptId, updatedAt: _updatedAt, ...row }) => row),
      futureMetadata: { retained: true },
    };
    expect(validateBackup(older)).toBe(true);
    const parsed = await readBackupFile(new File([JSON.stringify(older)], 'older.json'));
    expect(parsed).toEqual(JSON.parse(JSON.stringify(older)));
    await importBackup(parsed, 'replace');
    expect(await db.lessons.get(lesson.id)).toMatchObject({ name: 'Lesson' });
  });

  it('rejects invalid nested scheduling, review and content fields', async () => {
    const course = await createCourse('Nested records');
    const lesson = await createLesson(course.id, 'Lesson');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await createNote(lesson.id, 'Note', 'Content');
    await recordReview({
      card,
      deck: course,
      kind: 'course',
      eventId: 'nested-review',
      sessionId: 'nested-session',
      sessionKind: 'lesson',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });
    await expect
      .poll(() => db.sessionHistory.where('eventId').equals('nested-review').count())
      .toBe(1);
    const backup = await exportDatabase();
    expect(validateBackup(backup)).toBe(true);
    const invalid = [
      {
        ...backup,
        courses: [
          { ...backup.courses![0], fsrsParameters: { ...course.fsrsParameters, w: ['invalid'] } },
        ],
      },
      { ...backup, reviewHistory: [{ ...backup.reviewHistory![0], grade: 9 }] },
      { ...backup, notes: [{ ...backup.notes![0], content: null }] },
      {
        ...backup,
        cards: [
          {
            ...backup.cards[0],
            history: [{ ...backup.reviewHistory![0], responseTimeSec: Infinity }],
          },
        ],
      },
    ];
    const before = await Promise.all(db.tables.map((table) => table.toArray()));
    for (const value of invalid) {
      expect(validateBackup(value)).toBe(false);
      await expect(importBackup(value as typeof backup, 'replace')).rejects.toThrow(
        'Invalid backup file.',
      );
    }
    expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
  });

  it.each([
    'cards',
    'assets',
    'sessionHistory',
    'userPerformance',
    'courses',
    'lessons',
    'notes',
    'lessonCards',
    'lessonCardExposures',
    'lessonCompletions',
    'practiceNodes',
    'practiceMilestones',
    'courseAssessments',
    'revisionPlans',
    'sequences',
    'occlusions',
    'reviewHistory',
    'schedulingUnits',
    'coursePerformance',
    'schedulingPerformance',
    'tombstones',
    'concepts',
    'questions',
    'questionConcepts',
    'questionAttempts',
    'lineageIdMappings',
    'pendingMergeReviews',
    'agentMemories',
    'courseExamDates',
  ])('rejects malformed rows in %s', async (collection) => {
    const backup = await exportDatabase();
    expect(validateBackup({ ...backup, [collection]: [{}] })).toBe(false);
    expect(validateBackup({ ...backup, [collection]: 'not an array' })).toBe(false);
  });
});
