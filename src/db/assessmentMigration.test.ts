import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import type { CourseAssessment, Lesson } from './types';
import {
  buildCourseAssessmentMigration,
  finalAssessmentForCourse,
  hydrateCourse,
  type LegacyCourseRecord,
} from './assessmentMigration';
import { db } from './schema';

function legacyCourse(id: string, examDate: number): LegacyCourseRecord {
  return {
    id,
    name: `Course ${id}`,
    description: '',
    createdAt: 100,
    examDate,
    timeZone: 'Europe/London',
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 2,
  };
}

function lesson(id: string, courseId: string, orderIndex: number): Lesson {
  return {
    id,
    courseId,
    name: id,
    orderIndex,
    createdAt: orderIndex,
    isExtension: false,
  };
}

describe('course assessment migration', () => {
  afterEach(async () => {
    await db.delete();
  });

  it('creates one prefix final per course and strips compatibility fields from course rows', () => {
    const ids = ['final-a', 'final-b'][Symbol.iterator]();
    const result = buildCourseAssessmentMigration(
      [legacyCourse('a', 1_000), legacyCourse('b', 2_000)],
      [lesson('a1', 'a', 0), lesson('a2', 'a', 1)],
      [],
      () => ids.next().value!,
    );

    expect(result.courses).toHaveLength(2);
    expect(result.courses[0]).not.toHaveProperty('examDate');
    expect(result.courses[0]).not.toHaveProperty('timeZone');
    expect(result.assessments).toEqual([
      expect.objectContaining({
        id: 'final-a',
        courseId: 'a',
        kind: 'final',
        examDate: 1_000,
        timeZone: 'Europe/London',
        afterLessonId: 'a2',
        coverageMode: 'prefix',
        excludedCardIds: [],
      }),
      expect.objectContaining({
        id: 'final-b',
        courseId: 'b',
        kind: 'final',
        examDate: 2_000,
        afterLessonId: null,
        coverageMode: 'prefix',
      }),
    ]);
  });

  it('separates custom coverage from placement and preserves exclusions', () => {
    const result = buildCourseAssessmentMigration(
      [legacyCourse('course', 9_000)],
      [lesson('first', 'course', 0), lesson('middle', 'course', 1), lesson('last', 'course', 2)],
      [
        {
          id: 'checkpoint',
          courseId: 'course',
          name: 'Paper 1',
          examDate: 5_000,
          lessonIds: ['first', 'middle'],
          excludedCardIds: ['card'],
          createdAt: 200,
        },
      ],
      () => 'final',
    );

    expect(result.assessments[1]).toEqual({
      id: 'checkpoint',
      courseId: 'course',
      name: 'Paper 1',
      kind: 'checkpoint',
      examDate: 5_000,
      afterLessonId: 'middle',
      coverageMode: 'custom',
      lessonIds: ['first', 'middle'],
      excludedCardIds: ['card'],
      createdAt: 200,
    });
  });

  it.each([undefined, []] as const)(
    'migrates an unscoped legacy row to explicit prefix coverage (%s)',
    (lessonIds) => {
      const result = buildCourseAssessmentMigration(
        [legacyCourse('course', 9_000)],
        [lesson('first', 'course', 0), lesson('last', 'course', 1)],
        [
          {
            id: 'checkpoint',
            courseId: 'course',
            name: 'Mock',
            examDate: 5_000,
            lessonIds: lessonIds === undefined ? undefined : [...lessonIds],
            createdAt: 200,
          },
        ],
        () => 'final',
      );

      expect(result.assessments[1]).toEqual(
        expect.objectContaining({
          coverageMode: 'prefix',
          afterLessonId: 'last',
          excludedCardIds: [],
        }),
      );
      expect(result.assessments[1]).not.toHaveProperty('lessonIds');
    },
  );

  it('validates final cardinality and hydrates read-only compatibility values', () => {
    const record = buildCourseAssessmentMigration(
      [legacyCourse('course', 9_000)],
      [],
      [],
      () => 'final',
    ).courses[0];
    const final: CourseAssessment = {
      id: 'final',
      courseId: 'course',
      name: 'Final exam',
      kind: 'final',
      examDate: 9_000,
      timeZone: 'Europe/London',
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: 100,
    };

    expect(hydrateCourse(record, final)).toEqual(
      expect.objectContaining({ examDate: 9_000, timeZone: 'Europe/London' }),
    );
    expect(finalAssessmentForCourse('course', [final])).toBe(final);
    expect(() => finalAssessmentForCourse('course', [])).toThrow('exactly one final assessment');
    expect(() => finalAssessmentForCourse('course', [final, { ...final, id: 'other' }])).toThrow(
      'found 2',
    );
  });

  it('upgrades v13 data through the copy step and removes the legacy store', async () => {
    await db.delete();
    const legacy = new Dexie('lacuna');
    legacy.version(13).stores({
      courses: 'id, createdAt, examDate',
      lessons: 'id, courseId, orderIndex, createdAt',
      courseExamDates: 'id, courseId, examDate, createdAt',
    });
    await legacy.open();
    await legacy.table('courses').add(legacyCourse('course', 9_000));
    await legacy
      .table('lessons')
      .bulkAdd([lesson('first', 'course', 0), lesson('last', 'course', 1)]);
    await legacy.table('courseExamDates').bulkAdd([
      {
        id: 'scoped',
        courseId: 'course',
        name: 'Scoped',
        examDate: 4_000,
        lessonIds: ['first'],
        excludedCardIds: ['card'],
        createdAt: 110,
      },
      {
        id: 'unscoped',
        courseId: 'course',
        name: 'Unscoped',
        examDate: 5_000,
        createdAt: 120,
      },
    ]);
    legacy.close();

    await db.open();

    const storedCourse = await db.courses.get('course');
    expect(storedCourse).not.toHaveProperty('examDate');
    expect(storedCourse).not.toHaveProperty('timeZone');
    const assessments = await db.courseAssessments.where('courseId').equals('course').toArray();
    expect(assessments.filter((assessment) => assessment.kind === 'final')).toHaveLength(1);
    expect(assessments.find((assessment) => assessment.id === 'scoped')).toEqual(
      expect.objectContaining({
        kind: 'checkpoint',
        coverageMode: 'custom',
        lessonIds: ['first'],
        afterLessonId: 'first',
        excludedCardIds: ['card'],
      }),
    );
    expect(assessments.find((assessment) => assessment.id === 'unscoped')).toEqual(
      expect.objectContaining({ coverageMode: 'prefix', afterLessonId: 'last' }),
    );
    expect(db.tables.map((table) => table.name)).not.toContain('courseExamDates');
  });
});
