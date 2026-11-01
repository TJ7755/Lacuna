import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import {
  createQuestionSet,
  deleteQuestionSet,
  updateQuestionSet,
} from '../questions/questionSetRepository';
import { exportDatabase, importBackup } from './portability';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { manualMerge } from '../sync/manualMerge';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
import { questionPayloadV4 } from './mergeImport.testFixtures';

describe('mergeImport: v4 Question Set lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it.each(['question', 'part', 'subpart'] as const)(
    'preserves local Question Set targets and prerequisites at %s depth through update and recovery',
    async (depth) => {
      const initial = questionPayloadV4({ questions: [], lessons: [], questionSets: [] });
      initial.concepts.push({ id: 'concept-prerequisite', n: 'Prerequisite' });
      const { course } = await importLineageFirstTime(initial);
      await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
      const template = questionPayloadV4().questionSets[0];
      const answer = {
        ...template.questions[0].answer!,
        prerequisiteConceptIds: ['concept-prerequisite'],
      };
      const leaf = { id: 'leaf', prompt: 'Solve.', answer };
      const questions =
        depth === 'question'
          ? [{ ...leaf, parts: [] }]
          : [
              {
                id: 'question',
                prompt: 'Solve.',
                parts: [
                  depth === 'part'
                    ? { ...leaf, subparts: [] }
                    : { id: 'part', prompt: 'Solve.', subparts: [leaf] },
                ],
              },
            ];
      const created = await createQuestionSet(
        { ...template, id: 'local-set', courseId: course.id, lessonIds: [], questions },
        1_400,
      );
      const set = await updateQuestionSet(
        created.id,
        { ...created, title: 'Learner-edited paper' },
        { expectedContentRevisionId: created.contentRevisionId, now: 1_500 },
      );
      const attempt = await startQuestionSetAttempt(set.id, 'paper', 1_600);
      const before = await exportDatabase();
      expect(() => mergeSnapshots(before, before)).not.toThrow();
      await mergeLineageUpdate(
        course.id,
        questionPayloadV4({
          at: 2_000,
          rv: 2,
          concepts: [],
          questions: [],
          questionSets: [],
          lessons: [],
        }),
      );
      const after = await exportDatabase();
      expect(() => mergeSnapshots(after, after)).not.toThrow();
      expect(after.concepts).toEqual(before.concepts);
      expect(after.questionSets).toEqual(before.questionSets);
      expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
      expect(await db.tombstones.get(['concepts', 'concept-quadratic'])).toBeUndefined();
      await importBackup(after, 'replace');
      await manualMerge(before, { kind: 'peer' });
      expect(await db.questionSets.get(set.id)).toEqual(set);
      expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    },
  );

  it('repairs an already damaged database by combining an intact backup without losing receipts', async () => {
    const initial = questionPayloadV4({ questions: [], lessons: [] });
    initial.questionSets[0].lessonIds = [];
    const { course } = await importLineageFirstTime(initial);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_600);
    const intact = await exportDatabase();
    await db.concepts.delete('concept-quadratic');
    await db.tombstones.put({ table: 'concepts', recordId: 'concept-quadratic', deletedAt: 2_000 });
    const damaged = await exportDatabase();
    await expect(manualMerge(damaged)).rejects.toThrow('missing or cross-Course Concept');
    expect(await db.concepts.get('concept-quadratic')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    await manualMerge(intact);
    expect(await db.concepts.get('concept-quadratic')).toEqual(intact.concepts![0]);
    expect(await db.tombstones.get(['concepts', 'concept-quadratic'])).toMatchObject({
      deletedAt: 2_000,
    });
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    const repaired = await exportDatabase();
    await importBackup(repaired, 'replace');
    await manualMerge(damaged, { kind: 'peer' });
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({ courseId: course.id });
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(() => mergeSnapshots(repaired, damaged)).not.toThrow();
  });

  it('atomically rejects removal of a learner-edited published set and preserves syncable evidence', async () => {
    const initial = questionPayloadV4({ questions: [], lessons: [] });
    initial.questionSets[0].lessonIds = [];
    const { course } = await importLineageFirstTime(initial);
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': true });
    const imported = (await db.questionSets.get('set-quadratics'))!;
    const edited = await updateQuestionSet(
      imported.id,
      { ...imported, title: 'Learner revision' },
      { expectedContentRevisionId: imported.contentRevisionId, now: 1_500 },
    );
    const attempt = await startQuestionSetAttempt(imported.id, 'paper', 1_600);
    const before = await exportDatabase();
    await expect(
      mergeLineageUpdate(
        course.id,
        questionPayloadV4({
          at: 2_000,
          rv: 2,
          concepts: [],
          questions: [],
          questionSets: [],
          lessons: [],
        }),
      ),
    ).rejects.toThrow('locally edited Question Set');
    const after = await exportDatabase();
    expect(after.concepts).toEqual(before.concepts);
    expect(await db.questionSets.get(imported.id)).toEqual(edited);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(after.tombstones).toEqual(before.tombstones);
    expect(() => mergeSnapshots(after, before)).not.toThrow();
  });

  it('adopts a set and applies a later teacher revision', async () => {
    const first = questionPayloadV4();
    const { course } = await importLineageFirstTime(first);
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({
      courseId: course.id,
      title: 'Quadratics paper',
    });

    await mergeLineageUpdate(
      course.id,
      questionPayloadV4({
        at: 2_000,
        rv: 2,
        questionSets: [
          {
            ...first.questionSets[0],
            title: 'Updated quadratics paper',
            contentVersion: 2,
            contentRevisionId: 'set-revision-2',
            updatedAt: 2_000,
          },
        ],
      }),
    );
    expect(await db.questionSets.get('set-quadratics')).toMatchObject({
      title: 'Updated quadratics paper',
      contentRevisionId: 'set-revision-2',
    });
  });

  it('fails closed on local edits and local deletion', async () => {
    const first = questionPayloadV4();
    const { course } = await importLineageFirstTime(first);
    await db.questionSets.update('set-quadratics', {
      title: 'Learner edit',
      contentRevisionId: 'local-revision',
      updatedAt: 1_500,
    });
    await expect(
      mergeLineageUpdate(course.id, questionPayloadV4({ at: 2_000, rv: 2 })),
    ).rejects.toThrow('locally edited Question Set');
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Learner edit');

    await db.questionSets.update('set-quadratics', {
      title: first.questionSets[0].title,
      contentRevisionId: 'set-revision-1',
      updatedAt: 1_000,
    });
    await deleteQuestionSet('set-quadratics', 2_100);
    await expect(
      mergeLineageUpdate(course.id, questionPayloadV4({ at: 3_000, rv: 3 })),
    ).rejects.toThrow('locally deleted Question Set');
  });

  it('adopts linked assessments and retains attempts when the teacher revises or removes a set', async () => {
    const first = questionPayloadV4({
      exams: [
        { id: 'assessment-origin', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1_000 },
      ],
    });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: ['assessment-origin'] };
    const { course } = await importLineageFirstTime(first);
    expect((await db.courseAssessments.get('assessment-origin'))?.courseId).toBe(course.id);
    expect(await db.courseAssessments.where('courseId').equals(course.id).toArray()).toHaveLength(
      1,
    );
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual([
      'assessment-origin',
    ]);

    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_100);
    await db.cards.update('card-quadratic-example', { stability: 14, reps: 3, due: 9_000 });
    await mergeLineageUpdate(
      course.id,
      questionPayloadV4({
        exams: [
          {
            id: 'assessment-origin',
            n: 'Revised final',
            k: 'f',
            a: 0,
            m: 'p',
            e: 3_000_000,
            c: 1_000,
          },
        ],
        questionSets: [
          {
            ...first.questionSets[0],
            title: 'Revised paper',
            contentVersion: 2,
            contentRevisionId: 'set-revision-2',
          },
        ],
        at: 2_000,
        rv: 2,
      }),
    );
    expect((await db.courseAssessments.get('assessment-origin'))?.examDate).toBe(2_000_000);
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual([
      'assessment-origin',
    ]);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    expect(await db.cards.get('card-quadratic-example')).toMatchObject({
      stability: 14,
      reps: 3,
      due: 9_000,
    });

    await mergeLineageUpdate(
      course.id,
      questionPayloadV4({
        exams: [
          {
            id: 'assessment-origin',
            n: 'Revised final',
            k: 'f',
            a: 0,
            m: 'p',
            e: 3_000_000,
            c: 1_000,
          },
        ],
        questionSets: [],
        at: 3_000,
        rv: 3,
      }),
    );
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('rejects missing assessment links atomically', async () => {
    const payload = questionPayloadV4();
    payload.questionSets[0] = { ...payload.questionSets[0], assessmentIds: ['missing'] };
    await expect(importLineageFirstTime(payload)).rejects.toThrow('missing Assessment');
    expect(await db.courses.count()).toBe(0);
  });

  it('rejects local assessment edits and deletion without applying a teacher revision', async () => {
    const first = questionPayloadV4({
      exams: [
        { id: 'assessment-origin', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1_000 },
      ],
    });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: ['assessment-origin'] };
    const { course } = await importLineageFirstTime(first);
    const revised = questionPayloadV4({
      exams: [
        {
          id: 'assessment-origin',
          n: 'Teacher revision',
          k: 'f',
          a: 0,
          m: 'p',
          e: 3_000_000,
          c: 1_000,
        },
      ],
      questionSets: [
        {
          ...first.questionSets[0],
          title: 'Teacher revision',
          contentVersion: 2,
          contentRevisionId: 'set-revision-2',
        },
      ],
      at: 2_000,
      rv: 2,
    });
    await db.courseAssessments.update('assessment-origin', { name: 'Learner revision' });
    await expect(mergeLineageUpdate(course.id, revised)).rejects.toThrow(
      'locally edited Assessment',
    );
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Quadratics paper');
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);

    await db.courseAssessments.delete('assessment-origin');
    await db.tombstones.put({
      table: 'courseAssessments',
      recordId: 'assessment-origin',
      deletedAt: 1_500,
    });
    await expect(mergeLineageUpdate(course.id, revised)).rejects.toThrow(
      'locally deleted Assessment',
    );
    expect((await db.questionSets.get('set-quadratics'))?.title).toBe('Quadratics paper');
  });

  it('removes a checkpoint when the teacher unlinks it from the set', async () => {
    const final = {
      id: 'final-origin',
      n: 'Final',
      k: 'f' as const,
      a: 0,
      m: 'p' as const,
      e: 4_000_000,
      c: 1_000,
    };
    const checkpoint = {
      id: 'checkpoint-origin',
      n: 'Checkpoint',
      k: 'c' as const,
      a: 0,
      m: 'p' as const,
      e: 2_000_000,
      c: 1_000,
    };
    const first = questionPayloadV4({ exams: [final, checkpoint] });
    first.questionSets[0] = { ...first.questionSets[0], assessmentIds: [checkpoint.id] };
    const { course } = await importLineageFirstTime(first);
    expect(course.examDate).toBe(4_000_000);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'paper', 1_100);
    await db.questionSets.add({
      ...first.questionSets[0],
      id: 'local-set',
      courseId: course.id,
      contentRevisionId: 'local-revision',
    });
    const removal = questionPayloadV4({
      exams: [final],
      questionSets: [
        {
          ...first.questionSets[0],
          assessmentIds: [final.id],
          contentVersion: 2,
          contentRevisionId: 'set-revision-2',
        },
      ],
      at: 2_000,
      rv: 2,
    });
    await expect(mergeLineageUpdate(course.id, removal)).rejects.toThrow(
      'local Question Set still links to a removed Assessment',
    );
    expect(await db.courseAssessments.get(checkpoint.id)).toBeDefined();
    await db.questionSets.delete('local-set');
    await mergeLineageUpdate(course.id, removal);
    expect(await db.courseAssessments.get(checkpoint.id)).toBeUndefined();
    expect(await db.tombstones.get(['courseAssessments', checkpoint.id])).toBeDefined();
    expect((await db.questionSets.get('set-quadratics'))?.assessmentIds).toEqual([final.id]);
    expect((await db.questionSetAttempts.get(attempt.id))?.receipt.assessmentIds).toEqual([
      checkpoint.id,
    ]);
  });

  it('removes an untouched set when the teacher removes it', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV4());
    await mergeLineageUpdate(course.id, questionPayloadV4({ at: 2_000, rv: 2, questionSets: [] }));
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.tombstones.get(['questionSets', 'set-quadratics'])).toBeDefined();
  });
});
