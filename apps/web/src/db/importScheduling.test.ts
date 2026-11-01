import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { importSharePayload, type SharePayloadV2, type SharePayloadV6 } from './share';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { updateCourseAssessment } from './assessmentRepository';

const teacherDate = 1_900_000_000_000;
const learnerDate = 1_950_000_000_000;
const scheduling = {
  schedulingMode: 'exam' as const,
  examDate: learnerDate,
  timeZone: 'Europe/London',
};

function payload(version: 2 | 6): SharePayloadV2 | SharePayloadV6 {
  const base: SharePayloadV2 = {
    v: 2,
    at: 1000,
    li: 'scheduling-lineage',
    rv: 1,
    course: { n: 'Biology', o: 0, c: 1000, e: teacherDate, um: 'open' },
    lessons: [
      {
        i: 'scheduling-lesson',
        n: 'Cells',
        notes: [],
        cards: [{ id: 'scheduling-card', k: 0, f: 'Question', b: 'Answer' }],
      },
    ],
  };
  return version === 2
    ? base
    : {
        ...base,
        v: 6,
        lessons: base.lessons.map((lesson) => ({
          ...lesson,
          cards: lesson.cards.map((card) => ({ ...card, co: 'scheduling-concept' })),
        })),
        concepts: [{ id: 'scheduling-concept', n: 'Cells' }],
        questions: [],
        questionSets: [],
        questionSetPracticeNodes: [],
        exams: [
          {
            id: 'scheduling-final',
            n: 'Final',
            k: 'f',
            a: 0,
            m: 'p',
            e: teacherDate,
            tz: 'UTC',
            c: 1000,
          },
        ],
      };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it.each([2, 6] as const)('applies the learner target on plain v%s import', async (version) => {
  const source = payload(version);
  const original = structuredClone(source);
  const { courseIds } = await importSharePayload(source, scheduling);
  expect(await db.courseAssessments.where('courseId').equals(courseIds[0]).first()).toMatchObject(
    scheduling,
  );
  expect(source).toEqual(original);
});

it.each([2, 6] as const)(
  'retains the learner target through v%s lineage updates',
  async (version) => {
    const first = payload(version);
    const { course } = await importLineageFirstTime(first, scheduling);
    expect(course).toMatchObject(scheduling);
    for (const rv of [2, 3]) {
      const revised = payload(version);
      revised.rv = rv;
      revised.at = rv * 1000;
      revised.course.e = teacherDate + rv * 1000;
      revised.lessons[0].cards[0].b = `Answer ${rv}`;
      if (revised.v === 6) revised.exams![0].e = revised.course.e;
      await mergeLineageUpdate(course.id, revised);
      const final = await db.courseAssessments.where('courseId').equals(course.id).first();
      expect(final).toMatchObject(scheduling);
      expect((await db.cards.get('scheduling-card'))?.back).toBe(`Answer ${rv}`);
      if (version === 6) {
        const mapping = await db.lineageIdMappings.get('scheduling-lineage');
        expect(mapping?.assessmentSnapshots?.['scheduling-final'].examDate).toBe(revised.course.e);
      }
    }
  },
);

it.each([false, true])(
  'preserves no fixed exam after a later teacher mode change (%s)',
  async (teacherSteady) => {
    const first = payload(6);
    const { course } = await importLineageFirstTime(first, { schedulingMode: 'steady' });
    const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    // Also cover a learner changing their mind in the ordinary assessment editor.
    await updateCourseAssessment(final.id, scheduling);
    await updateCourseAssessment(final.id, { schedulingMode: 'steady' });
    const revised = payload(6) as SharePayloadV6;
    revised.rv = 2;
    revised.at = 2000;
    if (teacherSteady) {
      revised.course.sm = 1;
      delete revised.course.e;
      revised.exams![0].sm = 1;
      delete revised.exams![0].e;
      delete revised.exams![0].tz;
    }
    await mergeLineageUpdate(course.id, revised);
    const stored = await db.courseAssessments.get(final.id);
    expect(stored?.schedulingMode).toBe('steady');
    expect(stored?.examDate).toBeUndefined();
    expect(stored?.timeZone).toBeUndefined();
  },
);

it('applies the choice to detached-ID fallback imports', async () => {
  const source = payload(6);
  await importLineageFirstTime(source);
  const { course } = await importLineageFirstTime(source, { schedulingMode: 'steady' });
  expect(course.distributedCopy).toBeUndefined();
  expect(course.schedulingMode).toBe('steady');
  expect(course.examDate).toBeUndefined();
});

it.each([importSharePayload, importLineageFirstTime])(
  'rolls back a failed scheduling choice with the imported content (%s)',
  async (importCourse) => {
    await expect(
      importCourse(payload(6), { ...scheduling, examDate: Number.NaN }),
    ).rejects.toThrow();
    expect(await db.courses.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.courseAssessments.count()).toBe(0);
    expect(await db.lineageIdMappings.count()).toBe(0);
  },
);
