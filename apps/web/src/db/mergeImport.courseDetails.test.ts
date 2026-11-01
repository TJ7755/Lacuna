import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { SharePayloadV6 } from './share';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { coursePayload, lessonOne } from './mergeImport.testFixtures';

describe('mergeImport: course details', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  const course = (overrides: Partial<SharePayloadV6['course']> = {}): SharePayloadV6['course'] => ({
    n: 'Biology',
    d: 'Cells and genes',
    o: 0,
    c: 1000,
    sm: 1,
    um: 'open',
    ...overrides,
  });

  it("passes the teacher's new name, description and unlock mode on to the copy", async () => {
    const imported = await importLineageFirstTime(
      coursePayload({ course: course(), lessons: [lessonOne()] }),
    );
    await mergeLineageUpdate(
      imported.course.id,
      coursePayload({
        rv: 2,
        course: course({ n: 'Biology A', d: 'Revised', um: 'linear' }),
        lessons: [lessonOne()],
      }),
    );
    expect(await db.courses.get(imported.course.id)).toMatchObject({
      name: 'Biology A',
      description: 'Revised',
      unlockMode: 'linear',
    });
  });

  it("keeps the learner's own rename while still taking other teacher changes", async () => {
    const imported = await importLineageFirstTime(
      coursePayload({ course: course(), lessons: [lessonOne()] }),
    );
    await db.courses.update(imported.course.id, { name: 'My biology' });
    await mergeLineageUpdate(
      imported.course.id,
      coursePayload({
        rv: 2,
        course: course({ n: 'Biology A', d: 'Revised' }),
        lessons: [lessonOne()],
      }),
    );
    expect(await db.courses.get(imported.course.id)).toMatchObject({
      name: 'My biology',
      description: 'Revised',
    });
  });

  it('advances the teacher snapshot while retaining learner details across successive updates', async () => {
    const { course: imported } = await importLineageFirstTime(
      coursePayload({ course: course(), lessons: [lessonOne()] }),
    );
    await db.courses.update(imported.id, { name: 'My biology' });
    await mergeLineageUpdate(
      imported.id,
      coursePayload({
        rv: 2,
        by: 'New teacher',
        lessons: [lessonOne()],
        course: course({ n: 'Biology A', d: 'Revised' }),
      }),
    );
    expect((await db.courses.get(imported.id))?.distributedCopy?.source).toMatchObject({
      name: 'Biology A',
      description: 'Revised',
      creator: 'New teacher',
    });

    await mergeLineageUpdate(
      imported.id,
      coursePayload({
        rv: 3,
        by: undefined,
        lessons: [lessonOne()],
        course: course({ n: 'Biology B', d: undefined }),
      }),
    );
    const stored = (await db.courses.get(imported.id))!;
    expect(stored.name).toBe('My biology');
    expect(stored.description).toBe('');
    expect(stored.creator).toBeUndefined();
    expect(stored.distributedCopy?.source).toEqual({
      name: 'Biology B',
      description: '',
      creator: undefined,
      unlockMode: 'open',
    });
  });

  it('takes teacher details when an older copy has no source snapshot', async () => {
    const { course: imported } = await importLineageFirstTime(
      coursePayload({ course: course(), lessons: [lessonOne()] }),
    );
    await db.courses.update(imported.id, {
      name: 'Local name',
      'distributedCopy.source': undefined,
      'distributedCopy.autoAcceptUpdates': false,
    });
    await mergeLineageUpdate(
      imported.id,
      coursePayload({
        rv: 2,
        lessons: [lessonOne()],
        course: course({ n: 'Biology A', d: 'Revised', um: 'linear' }),
      }),
    );
    expect(await db.courses.get(imported.id)).toMatchObject({
      name: 'Biology A',
      description: 'Revised',
      unlockMode: 'linear',
      distributedCopy: { autoAcceptUpdates: false, revision: 2 },
    });
  });
});
