import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { SharePayloadV6 } from './share';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { exportDatabase } from './portability';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
import { questionPayloadV5 } from './mergeImport.testFixtures';

describe('mergeImport: v5 Question Set path activity lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adopts placements, applies teacher changes and removes untouched activities', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV5());
    expect(await db.practiceNodes.get('activity-quadratics')).toMatchObject({
      courseId: course.id,
      questionSetIds: ['set-quadratics'],
      afterLessonId: 'lesson-questions',
    });
    const updated = questionPayloadV5({
      at: 2_000,
      rv: 2,
      questionSetPracticeNodes: [
        {
          ...questionPayloadV5().questionSetPracticeNodes[0],
          name: 'Past paper practice',
          updatedAt: 2_000,
        },
      ],
    });
    await mergeLineageUpdate(course.id, updated);
    expect((await db.practiceNodes.get('activity-quadratics'))?.name).toBe('Past paper practice');
    await mergeLineageUpdate(
      course.id,
      questionPayloadV5({
        at: 3_000,
        rv: 3,
        questionSetPracticeNodes: [],
      }),
    );
    expect(await db.practiceNodes.get('activity-quadratics')).toBeUndefined();
    expect(await db.tombstones.get(['practiceNodes', 'activity-quadratics'])).toBeDefined();
  });

  it('rejects a local placement edit without partial teacher changes', async () => {
    const { course } = await importLineageFirstTime(questionPayloadV5());
    await db.practiceNodes.update('activity-quadratics', { name: 'Learner edit' });
    await expect(
      mergeLineageUpdate(
        course.id,
        questionPayloadV5({
          at: 2_000,
          rv: 2,
        }),
      ),
    ).rejects.toThrow('locally edited Question Set activity');
    expect((await db.practiceNodes.get('activity-quadratics'))?.name).toBe('Learner edit');
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);
  });
});

describe('mergeImport: ordered Question Set activity lineage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  function payload(): SharePayloadV6 {
    const base = questionPayloadV5();
    return {
      ...base,
      v: 6,
      questionSets: [
        base.questionSets[0],
        ...['set-b', 'set-c'].map((id) => ({ ...base.questionSets[0], id })),
      ],
      questionSetPracticeNodes: [
        {
          ...base.questionSetPracticeNodes[0],
          questionSetIds: ['set-c', 'set-quadratics', 'set-b'],
        },
      ],
    };
  }

  it('adopts every published identity and order, removes only unreferenced sets and retains attempts', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const node = (await db.practiceNodes.get('activity-quadratics'))!;
    expect(node.questionSetIds).toEqual(['set-c', 'set-quadratics', 'set-b']);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'practice');
    const update = {
      ...first,
      at: 2000,
      rv: 2,
      questionSets: first.questionSets.filter((set) => set.id !== 'set-quadratics'),
      questionSetPracticeNodes: [
        { ...first.questionSetPracticeNodes[0], questionSetIds: ['set-b', 'set-c'] },
      ],
    };
    await mergeLineageUpdate(course.id, update);
    expect((await db.practiceNodes.get(node.id))?.questionSetIds).toEqual(['set-b', 'set-c']);
    expect(await db.questionSets.get('set-quadratics')).toBeUndefined();
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('recovers v6 membership only from retained baselines without duplicating adopted content', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    const attempt = await startQuestionSetAttempt('set-quadratics', 'practice');
    await db.lineageIdMappings.update(first.li!, {
      lessonIds: [],
      cardIds: [],
      questionSetIds: [],
      questionSetPracticeNodeIds: [],
    });
    const retained = (await db.lineageIdMappings.get(first.li!))!;
    const next = {
      ...first,
      at: 2000,
      rv: 2,
      lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
      questionSetPracticeNodes: [
        {
          ...first.questionSetPracticeNodes[0],
          questionSetIds: ['set-b', 'set-c', 'set-quadratics'],
        },
      ],
    };
    expect(await mergeLineageUpdate(course.id, next)).toMatchObject({
      createdLessons: 0,
      createdCards: 0,
      conflictCount: 0,
    });
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(first.lessons.length);
    const recovered = (await db.lineageIdMappings.get(first.li!))!;
    const activity = next.questionSetPracticeNodes[0];
    expect(recovered.questionSetPracticeNodeIds).toEqual([activity.id]);
    expect(retained.questionSetPracticeNodeSnapshots?.[activity.id].questionSetIds).toEqual([
      'set-c',
      'set-quadratics',
      'set-b',
    ]);
    expect(recovered.questionSetPracticeNodeSnapshots?.[activity.id]).toEqual({
      questionSetIds: activity.questionSetIds,
      afterLessonId: activity.afterLessonId,
      name: activity.name,
    });
    expect((await db.practiceNodes.get(activity.id))?.questionSetIds).toEqual(
      activity.questionSetIds,
    );
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('rejects a v6 activity claimed by another lineage before applying publisher changes', async () => {
    const first = payload();
    const { course } = await importLineageFirstTime(first);
    await db.lineageIdMappings.add({
      id: 'other-lineage',
      courseId: course.id,
      lessonIds: [],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
      questionSetPracticeNodeIds: [first.questionSetPracticeNodes[0].id],
    });
    const before = await exportDatabase();
    await expect(
      mergeLineageUpdate(course.id, {
        ...first,
        rv: 2,
        lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
      }),
    ).rejects.toThrow(/integrity check failed.*claimed by another lineage/);
    expect({ ...(await exportDatabase()), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
  });

  it.each(['missing activity baseline', 'missing assessment baseline', 'edited assessment'])(
    'retains protected v6 failures and rolls back recovery with %s',
    async (damage) => {
      const first: SharePayloadV6 = {
        ...payload(),
        exams: [{ id: 'published-final', n: 'Final', k: 'f', a: 0, m: 'p', e: 2_000_000, c: 1000 }],
      };
      const { course } = await importLineageFirstTime(first);
      await db.lineageIdMappings.update(first.li!, {
        lessonIds: [],
        cardIds: [],
        questionSetPracticeNodeIds: [],
        ...(damage === 'missing activity baseline' ? { questionSetPracticeNodeSnapshots: {} } : {}),
        ...(damage === 'missing assessment baseline' ? { assessmentSnapshots: {} } : {}),
      });
      if (damage === 'edited assessment')
        await db.courseAssessments.update('published-final', { name: 'Local final' });
      const before = await exportDatabase();
      await expect(
        mergeLineageUpdate(course.id, {
          ...first,
          rv: 2,
          lessons: first.lessons.map((lesson) => ({ ...lesson, n: 'Publisher lesson' })),
        }),
      ).rejects.toThrow(
        damage === 'missing activity baseline' ? 'Question Set activity' : 'Assessment',
      );
      expect({ ...(await exportDatabase()), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
    },
  );

  it.each(['membership', 'order', 'anchor', 'name', 'deletion race'])(
    'rejects %s conflicts without partial published changes',
    async (conflict) => {
      const first = payload();
      const { course } = await importLineageFirstTime(first);
      const id = 'activity-quadratics';
      if (conflict === 'membership')
        await db.practiceNodes.update(id, { questionSetIds: ['set-c'] });
      if (conflict === 'order')
        await db.practiceNodes.update(id, { questionSetIds: ['set-b', 'set-c', 'set-quadratics'] });
      if (conflict === 'anchor')
        await db.practiceNodes.update(id, { afterLessonId: 'local-anchor' });
      if (conflict === 'name') await db.practiceNodes.update(id, { name: 'Local name' });
      const before = await exportDatabase();
      const update = {
        ...first,
        at: 2000,
        rv: 2,
        questionSets: first.questionSets.filter(
          (set) => conflict !== 'deletion race' || set.id !== 'set-b',
        ),
      };
      await expect(mergeLineageUpdate(course.id, update)).rejects.toThrow('Question Set activity');
      expect(await db.practiceNodes.toArray()).toEqual(before.practiceNodes);
      expect(await db.questionSets.toArray()).toEqual(before.questionSets);
      expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(1);
    },
  );
});

describe.each([6] as const)(
  'lineage recovery preserves protected V%i authoring baselines',
  (version) => {
    beforeEach(async () => {
      await db.delete();
      await db.open();
    });

    it.each(['missing registry', 'missing set revision', 'edited set'])(
      'rejects %s atomically instead of bypassing Question Set guards',
      async (damage) => {
        const payload = { ...questionPayloadV5(), v: version };
        const { course } = await importLineageFirstTime(payload);
        if (damage === 'missing registry') await db.lineageIdMappings.delete(payload.li!);
        else
          await db.lineageIdMappings.update(payload.li!, {
            lessonIds: [],
            ...(damage === 'missing set revision' ? { questionSetRevisions: {} } : {}),
          });
        if (damage === 'edited set')
          await db.questionSets.update('set-quadratics', {
            title: 'Learner paper',
            contentRevisionId: 'learner-revision',
          });
        const before = await exportDatabase();
        const next = { ...questionPayloadV5({ rv: 22 }), v: version };
        next.questionSets[0].title = 'Publisher paper';
        await expect(mergeLineageUpdate(course.id, next)).rejects.toThrow(/Question Set/);
        expect({ ...(await exportDatabase()), exportedAt: 0 }).toEqual({
          ...before,
          exportedAt: 0,
        });
      },
    );

    it('restores Lesson membership without changing Question evidence or path activities', async () => {
      const payload = { ...questionPayloadV5(), v: version };
      const { course } = await importLineageFirstTime(payload);
      await db.lineageIdMappings.update(payload.li!, { lessonIds: [], cardIds: [] });
      const before = await exportDatabase();
      await mergeLineageUpdate(course.id, { ...questionPayloadV5({ rv: 22 }), v: version });
      const after = await exportDatabase();
      expect(after.questionSetAttempts).toEqual(before.questionSetAttempts);
      expect(after.questions?.map(({ authoringRevisionId: _revision, ...row }) => row)).toEqual(
        before.questions?.map(({ authoringRevisionId: _revision, ...row }) => row),
      );
      expect(after.practiceNodes).toEqual(before.practiceNodes);
    });
  },
);
