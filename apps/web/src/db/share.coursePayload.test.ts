import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseCard,
  createLesson,
  createLessonCard,
  createNote,
  linkCardToLesson,
  updateCourse,
} from './repository';
import { publishCourse } from './courseRepository';
import {
  buildCourseShareCode,
  decodeShare,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  summariseShare,
} from './share';
import { assetUrl, storeAudioBlob, storeImageBlob } from './assets';
import type { ItemPayload } from '@lacuna/core/db/types';
import { reset } from './share.testFixtures';

describe('course share payload content', () => {
  beforeEach(reset);

  it('preserves lesson typing and explicit card overrides through a share code', async () => {
    const course = await createCourse('Typing');
    const lesson = await createLesson(course.id, 'Vocabulary', { answerMode: 'type' });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    await db.cards.update(card.id, { answerMode: 'reveal' });
    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    await importSharePayload(payload);
    const imported = (await db.lessons.toArray()).find((row) => row.id !== lesson.id)!;
    expect(imported.answerMode).toBe('type');
    const cards = await db.cards.where('primaryLessonId').equals(imported.id).toArray();
    expect(cards[0].answerMode).toBe('reveal');
  });

  it('identifies stripped audio as audio while retaining the legacy omission flag', async () => {
    const course = await createCourse('Audio course');
    const lesson = await createLesson(course.id, 'Listening');
    const asset = await storeAudioBlob(new Blob(['spoken'], { type: 'audio/mpeg' }));
    await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      `Listen\n![audio](${assetUrl(asset.hash)})`,
      'Answer',
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    expect(summariseShare(payload).omittedImages).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(asset.hash);
    expect(JSON.stringify(payload)).toContain('Audio omitted from share code');
  });

  it('round-trips structured item payloads without changing their contents', async () => {
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Algebra');
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Solve 2x = 8.',
      'x = 4',
    );
    const itemPayload: ItemPayload = {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 1, label: 'rearrange', kind: 'waypoint', expression: '2x = 8' },
        { marks: 1, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
      ],
      fixtures: [
        {
          id: 'fixture-1',
          studentAnswer: ['2x = 8', 'x = 4'],
          expectedMarks: 2,
          note: 'Complete solution',
        },
      ],
    };
    await db.cards.update(card.id, { payload: itemPayload });

    const payload = await decodeShare(await buildCourseShareCode(course.id));

    expect(payload.lessons[0].cards[0].p).toEqual(itemPayload);

    await reset();
    await importSharePayload(payload);

    const imported = (await db.cards.toArray())[0];
    expect(imported.payload).toEqual(itemPayload);
    expect(JSON.stringify(imported.payload)).toBe(JSON.stringify(itemPayload));
  });

  it('leaves payload-less card encoding unchanged', async () => {
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Arithmetic');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', '2 + 2', '4', [
      'number',
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));

    expect(payload.lessons[0].cards[0]).toEqual({
      id: card.id,
      k: 0,
      f: '2 + 2',
      b: '4',
      g: ['number'],
      co: card.conceptId,
    });
    expect(JSON.stringify(payload.lessons[0].cards[0])).not.toContain('"p"');
  });

  it('preserves unknown payload versions and kinds for the read-only fallback', async () => {
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Future items');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Future question', 'Fallback');
    const payload = await decodeShare(await buildCourseShareCode(course.id));

    const futurePayload = { v: 2, kind: 'proof-tree', nodes: [{ statement: 'A' }] };
    payload.lessons[0].cards[0].p = futurePayload;

    const decoded = await decodeShareDirect(await encodeShareDirect(payload));

    expect(decoded.lessons[0].cards[0].p).toEqual(futurePayload);

    const unknownKind = { v: 1, kind: 'proof-tree', nodes: [{ statement: 'B' }] };
    decoded.lessons[0].cards[0].p = unknownKind;
    const decodedUnknownKind = await decodeShareDirect(await encodeShareDirect(decoded));
    expect(decodedUnknownKind.lessons[0].cards[0].p).toEqual(unknownKind);

    await reset();
    await importSharePayload(decodedUnknownKind);
    expect((await db.cards.toArray())[0].payload).toEqual(unknownKind);
  });

  it('rejects malformed payloads for a known item kind', async () => {
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Broken items');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Fallback');
    const payload = await decodeShare(await buildCourseShareCode(course.id));

    Object.assign(payload.lessons[0].cards[0], { p: { v: 1, kind: 'numeric' } });

    await expect(decodeShareDirect(await encodeShareDirect(payload))).rejects.toThrow(
      /unsupported version/,
    );
  });

  it('reflects image stripping in both notes and cards via summariseShare', async () => {
    const course = await createCourse('Anatomy');
    const lesson = await createLesson(course.id, 'Skeleton');
    const asset = await storeImageBlob(
      new Blob(['img'], { type: 'image/png' }),
      'image/png',
      50,
      50,
    );
    await createNote(lesson.id, 'Diagram', `See scan\n![scan](${assetUrl(asset.hash)})`);
    await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      `Label\n![x](${assetUrl(asset.hash)})`,
      'Back',
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));

    expect(payload.lessons[0].notes[0].i).toBe(1);
    expect(payload.lessons[0].cards[0].i).toBe(1);

    const summary = summariseShare(payload);
    expect(summary.omittedImages).toBe(true);
  });

  it('omits li/rv and per-entity originating ids for a course that has never published', async () => {
    const course = await createCourse('Geology');
    const lesson = await createLesson(course.id, 'Rocks');
    await createNote(lesson.id, 'Overview', 'Igneous, sedimentary, metamorphic.');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Front', 'Back');

    const payload = await decodeShare(await buildCourseShareCode(course.id));

    expect(payload.li).toBeUndefined();
    expect(payload.rv).toBeUndefined();
    expect(payload.lessons[0].i).toBeUndefined();
    expect(payload.lessons[0].notes[0].oi).toBeUndefined();
  });

  it('packs li/rv and per-entity originating ids for a published course', async () => {
    const course = await createCourse('Geology');
    await updateCourse(course.id, {
      distribution: { lineageId: 'lin_1', revision: 3, publishedAt: Date.now() },
    });
    const lesson = await createLesson(course.id, 'Rocks');
    const note = await createNote(lesson.id, 'Overview', 'Igneous, sedimentary, metamorphic.');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Front', 'Back');
    const bankCard = await createCourseCard(course.id, 'front_back', 'Quartz', 'Mineral');
    await linkCardToLesson(lesson.id, bankCard.id);

    const payload = await decodeShare(await buildCourseShareCode(course.id));

    expect(payload.li).toBe('lin_1');
    expect(payload.rv).toBe(3);
    expect(payload.lessons[0].i).toBe(lesson.id);
    expect(payload.lessons[0].notes[0].oi).toBe(note.id);
    expect(payload.lessons[0].cards[0].id).toBe(card.id);
    expect(payload.bankCards?.[0].id).toBe(bankCard.id);
  });

  it('publishes an assessment-linked Question Set with its assessment identity', async () => {
    const course = await createCourse('Published questions');
    const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    await db.questionSets.add({
      id: 'published-set',
      courseId: course.id,
      title: 'Final paper',
      lessonIds: [],
      assessmentIds: [assessment.id],
      questions: [
        {
          id: 'published-question',
          prompt: 'Explain.',
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'published-allocation',
                criterion: 'Explains',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
          parts: [],
        },
      ],
      contentVersion: 1,
      contentRevisionId: 'published-revision',
      createdAt: 1,
      updatedAt: 1,
    });
    await publishCourse(course.id);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v !== 6) throw new Error('Expected a v6 course payload.');
    expect(payload.exams?.[0].id).toBe(assessment.id);
    expect(payload.questionSets[0].assessmentIds).toEqual([assessment.id]);
  });
});
