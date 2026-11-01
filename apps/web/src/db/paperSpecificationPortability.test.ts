import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { db } from './schema';
import { createCourse, publishCourse, updateCourse } from './courseRepository';
import {
  createLesson,
  createLessonCard,
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from './repository';
import { setCoursePaperAssessments } from './paperAssessmentRepository';
import { buildCourseFile, decodeCourseFile } from './courseFile';
import {
  buildCourseSharePayload,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  parseSharePayload,
} from './share';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { decodeSnapshot, encodeSnapshot } from '../sync/snapshot';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import type { BackupFile } from '@lacuna/core/db/types';

async function reset() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}

async function paperCourse() {
  const course = await createCourse('Science', {
    specificationRef: paperSpecificationReference,
    specificationData: paperSpecification,
    examDate: Date.parse('2027-06-20T09:00:00Z'),
  });
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'What is a cell?',
    'A unit of life.',
  );
  await db.concepts.update(card.conceptId, { specificationPointIds: ['example-science:cells'] });
  const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  await updateCourseAssessment(final.id, {
    name: 'Second paper',
    coverageMode: 'specification',
    specificationPaperId: 'paper-2',
  });
  const first = await createCourseAssessment(
    course.id,
    'First paper',
    Date.parse('2027-06-10T09:00:00Z'),
    {
      coverageMode: 'specification',
      specificationPointIds: ['example-science:cells'],
      afterLessonId: lesson.id,
    },
  );
  return { course, first, final };
}

beforeEach(reset);

describe('course-supplied paper portability', () => {
  it.each(['backup replacement', 'backup merge', 'sync'] as const)(
    'retains course metadata and both coverage selectors through %s',
    async (format) => {
      const { course, first, final } = await paperCourse();
      const backup = await exportDatabase();
      const originalAssessments = await db.courseAssessments.toArray();
      const parsed =
        format === 'sync' ? await decodeSnapshot((await encodeSnapshot(backup)).payload) : backup;
      await reset();
      await importBackup(parsed, format === 'backup merge' ? 'merge' : 'replace');
      expect(await db.courses.get(course.id)).toMatchObject({
        specificationData: paperSpecification,
        specificationRef: paperSpecificationReference,
      });
      expect(await db.courseAssessments.toArray()).toEqual(
        expect.arrayContaining(originalAssessments),
      );
      expect(await db.courseAssessments.get(first.id)).toMatchObject({
        specificationPointIds: ['example-science:cells'],
      });
      expect(await db.courseAssessments.get(final.id)).toMatchObject({
        specificationPaperId: 'paper-2',
      });
    },
  );

  it.each(['share code', 'course file'] as const)(
    'retains metadata and paper identities through a real %s',
    async (format) => {
      const { course } = await paperCourse();
      const payload =
        format === 'share code'
          ? await decodeShareDirect(
              await encodeShareDirect(await buildCourseSharePayload(course.id)),
            )
          : (await decodeCourseFile(await buildCourseFile(course.id))).payload;
      await reset();
      const imported = await importSharePayload(payload);
      expect(await db.courses.get(imported.courseIds[0])).toMatchObject({
        specificationData: paperSpecification,
        specificationRef: paperSpecificationReference,
      });
      expect(await db.courseAssessments.toArray()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'First paper',
            coverageMode: 'specification',
            specificationPointIds: ['example-science:cells'],
          }),
          expect.objectContaining({
            name: 'Second paper',
            coverageMode: 'specification',
            specificationPaperId: 'paper-2',
          }),
        ]),
      );
    },
  );

  it('updates publisher metadata and preserves the learner final date and assessment identities', async () => {
    const { course, first, final } = await paperCourse();
    await publishCourse(course.id);
    const initial = await buildCourseSharePayload(course.id);
    const corrected = { ...paperSpecification, title: 'Corrected science' };
    await updateCourse(course.id, { specificationData: corrected });
    await publishCourse(course.id);
    const update = await buildCourseSharePayload(course.id);
    await reset();
    const imported = await importLineageFirstTime(initial);
    const learnerDate = Date.parse('2027-06-21T09:00:00Z');
    await updateCourseAssessment(final.id, { examDate: learnerDate });
    await mergeLineageUpdate(imported.course.id, update);
    expect(await db.courses.get(imported.course.id)).toMatchObject({
      specificationData: corrected,
      distributedCopy: { source: { specificationData: corrected } },
    });
    expect(await db.courseAssessments.get(final.id)).toMatchObject({
      examDate: learnerDate,
      specificationPaperId: 'paper-2',
    });
    expect(await db.courseAssessments.get(first.id)).toMatchObject({
      specificationPointIds: ['example-science:cells'],
    });
  });

  it('keeps learner-configured papers through ordinary publisher updates and rejects conflicting source papers', async () => {
    const authored = await createCourse('Published science', {
      specificationData: paperSpecification,
      specificationRef: paperSpecificationReference,
      examDate: Date.parse('2027-06-20T09:00:00Z'),
    });
    await publishCourse(authored.id);
    const initial = await buildCourseSharePayload(authored.id);
    await updateCourse(authored.id, { description: 'Publisher description correction' });
    await publishCourse(authored.id);
    const corrected = await buildCourseSharePayload(authored.id);
    await setCoursePaperAssessments(authored.id, [
      { paperId: 'paper-2', examDate: Date.parse('2027-06-10T09:00:00Z') },
      { paperId: 'paper-1', examDate: Date.parse('2027-06-20T09:00:00Z') },
    ]);
    await publishCourse(authored.id);
    const conflicting = await buildCourseSharePayload(authored.id);
    await reset();
    const imported = await importLineageFirstTime(initial);
    await setCoursePaperAssessments(imported.course.id, [
      {
        paperId: 'paper-1',
        examDate: Date.parse('2027-06-10T09:00:00Z'),
        timeZone: 'Europe/London',
      },
      {
        paperId: 'paper-2',
        examDate: Date.parse('2027-06-21T09:00:00Z'),
        timeZone: 'Europe/London',
      },
    ]);
    const configured = await db.courseAssessments
      .where('courseId')
      .equals(imported.course.id)
      .toArray();
    await mergeLineageUpdate(imported.course.id, corrected);
    expect((await db.courses.get(imported.course.id))?.description).toBe(
      'Publisher description correction',
    );
    expect(
      await db.courseAssessments.where('courseId').equals(imported.course.id).toArray(),
    ).toEqual(configured);
    const mapping = (await db.lineageIdMappings.get(corrected.li!))!;
    const sourceFinal = corrected.exams!.find((exam) => exam.k === 'f')!;
    expect(mapping.assessmentSnapshots![sourceFinal.id!]).toMatchObject({
      name: sourceFinal.n,
      coverageMode: 'prefix',
      examDate: sourceFinal.e,
    });
    expect(mapping.assessmentSnapshots![sourceFinal.id!]).not.toHaveProperty(
      'specificationPaperId',
    );
    const before = await Promise.all(db.tables.map((table) => table.toArray()));
    await expect(mergeLineageUpdate(imported.course.id, conflicting)).rejects.toThrow(
      /locally edited Assessment/,
    );
    expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
  });

  it.each([
    { specificationPaperId: 'paper-1', specificationPointIds: ['example-science:cells'] },
    { specificationPaperId: undefined, specificationPointIds: [] },
    { specificationPaperId: undefined, specificationPointIds: ['unqualified'] },
  ])(
    'rejects malformed paper selectors before a backup restore writes anything: %j',
    async (selector) => {
      const { first } = await paperCourse();
      const backup = await exportDatabase();
      const malformed = {
        ...backup,
        courseAssessments: backup.courseAssessments!.map((assessment) =>
          assessment.id === first.id ? { ...assessment, ...selector } : assessment,
        ),
      } as BackupFile;
      const before = await Promise.all(db.tables.map((table) => table.toArray()));
      expect(validateBackup(malformed)).toBe(false);
      await expect(importBackup(malformed, 'replace')).rejects.toThrow(/Invalid backup file/);
      expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
    },
  );

  it('refuses an incompatible paper restored into a newer course selection without writing', async () => {
    const { course, first } = await paperCourse();
    await updateCourseAssessment(first.id, { specificationPointIds: ['example-science:enzymes'] });
    const backup = await exportDatabase();
    await deleteCourseAssessment(first.id);
    await updateCourse(course.id, {
      specificationRef: { ...paperSpecificationReference, tier: 'foundation' },
    });
    const before = await Promise.all(db.tables.map((table) => table.toArray()));
    await expect(importBackup(backup, 'merge')).rejects.toThrow(/does not apply/);
    expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
  });

  it('refuses a peer merge that combines a newer tier with an independently added paper', async () => {
    const { course, first } = await paperCourse();
    await deleteCourseAssessment(first.id);
    const sharedState = await exportDatabase();
    await createCourseAssessment(
      course.id,
      'Independent higher paper',
      Date.parse('2027-06-15T09:00:00Z'),
      {
        coverageMode: 'specification',
        specificationPointIds: ['example-science:enzymes'],
      },
    );
    const higherPeer = await exportDatabase();
    await importBackup(sharedState, 'replace');
    await updateCourse(course.id, {
      specificationRef: { ...paperSpecificationReference, tier: 'foundation' },
    });
    const foundationPeer = await exportDatabase();
    expect(validateBackup(higherPeer)).toBe(true);
    expect(validateBackup(foundationPeer)).toBe(true);
    expect(() => mergeSnapshots(higherPeer, foundationPeer)).toThrow(/does not apply/);
  });

  it('rejects mismatched course metadata and mixed coverage modes at share and authoring boundaries', async () => {
    const { course } = await paperCourse();
    const payload = await buildCourseSharePayload(course.id);
    expect(() =>
      parseSharePayload({
        ...payload,
        course: { ...payload.course, specificationRef: { specificationId: 'another-spec' } },
      }),
    ).toThrow(/unsupported version/i);
    const mixed = structuredClone(payload);
    mixed.exams![0] = { ...mixed.exams![0], m: 'p', specificationPaperId: 'paper-1' };
    expect(() => parseSharePayload(mixed)).toThrow(/unsupported version/i);
    await expect(
      updateCourse(course.id, { specificationRef: { specificationId: 'another-spec' } }),
    ).rejects.toThrow(/match/);
    expect((await db.courses.get(course.id))?.specificationRef).toEqual(
      paperSpecificationReference,
    );
  });
});
