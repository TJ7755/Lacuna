import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NativeBlob } from 'node:buffer';
import { db } from './schema';
import { createCourse, createLesson, createLessonCard, createNote } from './repository';
import { createOcclusion } from './occlusionRepository';
import { assetUrl, storeImageBlob, storeAudioBlob } from './assets';
import { importSharePayload } from './share';
import { occlusionDataByCard } from './occlusionStudy';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { publishCourse } from './courseRepository';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { createConcept, createFixedQuestion } from '../questions/repository';

async function clearDatabase() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}

async function seedCourse() {
  const course = await createCourse('Biology');
  const lesson = await createLesson(course.id, 'Cells');
  const image = await storeImageBlob(
    new Blob(['diagram'], { type: 'image/png' }),
    'image/png',
    800,
    600,
  );
  const audio = await storeAudioBlob(new Blob(['recording'], { type: 'audio/mpeg' }));
  await storeImageBlob(new Blob(['unrelated'], { type: 'image/png' }), 'image/png', 10, 10);
  await createOcclusion(course.id, lesson.id, 'Plant cell', image.hash, [
    {
      id: 'nucleus',
      role: 'label',
      shape: 'rectangle',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      answerText: 'Nucleus',
    },
  ]);
  await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    `![Cell](${assetUrl(image.hash)})`,
    `![audio](${assetUrl(audio.hash)})`,
  );
  await createNote(lesson.id, 'Diagram', `![Cell](${assetUrl(image.hash)})`);
  return { course, image, audio };
}

beforeEach(clearDatabase);

describe('course files', () => {
  it('exports Blob-backed media even when reading its bytes takes another task', async () => {
    const { course, image } = await seedCourse();
    await db.assets.update(image.hash, { blob: new NativeBlob(['diagram']) as unknown as Blob });
    const read = NativeBlob.prototype.arrayBuffer;
    const spy = vi.spyOn(NativeBlob.prototype, 'arrayBuffer').mockImplementation(async function (this: NativeBlob) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return read.call(this);
    });
    try {
      const file = await decodeCourseFile(await buildCourseFile(course.id));
      expect(file.assets.find((asset) => asset.hash === image.hash)?.data).toBe(btoa('diagram'));
    } finally {
      spy.mockRestore();
    }
  });

  it('preserves recipient metadata when an imported asset already exists', async () => {
    const { course, image } = await seedCourse();
    const file = await decodeCourseFile(await buildCourseFile(course.id));
    const incoming = file.assets.find((asset) => asset.hash === image.hash)!;
    incoming.mimeType = 'audio/mpeg';
    incoming.kind = 'audio';
    incoming.width = 1;
    await withCourseFileAssets(file, () => importSharePayload(file.payload));
    expect(await db.assets.get(image.hash)).toEqual(image);
  });

  it('transfers a usable occlusion, card media and notes into an empty recipient database', async () => {
    const { course, image, audio } = await seedCourse();
    const sourceCards = await db.cards.toArray();
    await db.cards.update(sourceCards[0].id, { reps: 12, lapses: 3 });
    const text = await buildCourseFile(course.id);
    const file = await decodeCourseFile(text);
    expect(file.assets.map((asset) => asset.hash).sort()).toEqual([image.hash, audio.hash].sort());
    await clearDatabase();

    const result = await withCourseFileAssets(file, () => importSharePayload(file.payload));
    expect(result.courses).toBe(1);
    const cards = await db.cards.toArray();
    expect(cards.every((card) => card.reps === 0 && card.lapses === 0)).toBe(true);
    expect(cards.every((card) => !sourceCards.some((source) => source.id === card.id))).toBe(true);
    const diagrams = await occlusionDataByCard(cards);
    expect(diagrams.size).toBe(1);
    const diagram = [...diagrams.values()][0];
    expect(diagram.answerText).toBe('Nucleus');
    const restored = await db.assets.get(diagram.occlusion.assetHash);
    expect(restored?.blob).toEqual(image.blob);
    expect(restored?.width).toBe(800);
    expect(
      cards.some(
        (card) =>
          card.front.includes(assetUrl(image.hash)) && card.back.includes(assetUrl(audio.hash)),
      ),
    ).toBe(true);
    expect((await db.notes.toArray())[0].content).toContain(assetUrl(image.hash));
    expect(await db.assets.count()).toBe(2);
  });

  it('refuses an export when a required diagram is missing', async () => {
    const { course, image } = await seedCourse();
    await db.assets.delete(image.hash);
    await expect(buildCourseFile(course.id)).rejects.toThrow(/missing media/i);
  });

  it('includes media referenced only by a Question', async () => {
    const course = await createCourse('Questions');
    const concept = await createConcept(course.id, 'Reading diagrams');
    const image = await storeImageBlob(
      new Blob(['question image'], { type: 'image/png' }),
      'image/png',
      100,
      100,
    );
    await createFixedQuestion({
      courseId: course.id,
      name: 'Count the cells',
      prompt: `![Cells](${assetUrl(image.hash)})`,
      explanation: `Look at the diagram: ![Cells](${assetUrl(image.hash)})`,
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
      targetConceptId: concept.id,
    });
    const file = await decodeCourseFile(await buildCourseFile(course.id));
    await clearDatabase();
    await withCourseFileAssets(file, () => importSharePayload(file.payload));
    const question = (await db.questions.toArray())[0];
    expect(question.kind).toBe('fixed');
    if (question.kind !== 'fixed') throw new Error('Expected a fixed Question');
    expect(question.prompt).toContain(assetUrl(image.hash));
    expect(question.explanation).toContain(assetUrl(image.hash));
    expect(await db.assets.count()).toBe(1);
    expect(await db.questionAttempts.count()).toBe(0);
  });

  it('supplies diagrams to the published-course importer and later updates', async () => {
    const { course, image } = await seedCourse();
    await publishCourse(course.id);
    const first = await decodeCourseFile(await buildCourseFile(course.id));
    const replacement = await storeImageBlob(
      new Blob(['updated diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    const sourceOcclusion = (await db.occlusions.toArray())[0];
    await db.occlusions.update(sourceOcclusion.id, { assetHash: replacement.hash });
    await publishCourse(course.id);
    const second = await decodeCourseFile(await buildCourseFile(course.id));
    await clearDatabase();
    const imported = await withCourseFileAssets(first, () => importLineageFirstTime(first.payload));
    expect(imported.course.distributedCopy?.revision).toBe(1);
    expect((await db.assets.get(image.hash))?.blob).toEqual(image.blob);
    expect((await occlusionDataByCard(await db.cards.toArray())).size).toBe(1);
    await withCourseFileAssets(second, () =>
      mergeLineageUpdate(imported.course.id, second.payload),
    );
    expect((await db.courses.get(imported.course.id))?.distributedCopy?.revision).toBe(2);
    expect((await db.occlusions.toArray())[0].assetHash).toBe(replacement.hash);
    expect((await db.assets.get(replacement.hash))?.blob).toEqual(replacement.blob);
    expect(await db.courses.count()).toBe(1);
  });

  it('rejects missing, corrupt and unrelated assets before writing anything', async () => {
    const { course } = await seedCourse();
    const original = JSON.parse(await buildCourseFile(course.id));
    await clearDatabase();
    const missing = structuredClone(original);
    missing.assets.pop();
    await expect(decodeCourseFile(JSON.stringify(missing))).rejects.toThrow(/missing media/i);
    const corrupt = structuredClone(original);
    corrupt.assets[0].data = btoa('corrupt');
    await expect(decodeCourseFile(JSON.stringify(corrupt))).rejects.toThrow(/corrupt/i);
    const duplicate = structuredClone(original);
    duplicate.assets.push(duplicate.assets[0]);
    await expect(decodeCourseFile(JSON.stringify(duplicate))).rejects.toThrow(/duplicate/i);
    const unrelated = structuredClone(original);
    unrelated.payload.occlusions = [];
    unrelated.payload.lessons = [];
    await expect(decodeCourseFile(JSON.stringify(unrelated))).rejects.toThrow(/unrelated/i);
    await expect(decodeCourseFile('{"format":"lacuna-course","version":99}')).rejects.toThrow();
    expect(await db.assets.count()).toBe(0);
    expect(await db.courses.count()).toBe(0);
  });

  it('rolls back media and content together when import fails', async () => {
    const { course } = await seedCourse();
    const file = await decodeCourseFile(await buildCourseFile(course.id));
    await clearDatabase();
    await expect(
      withCourseFileAssets(file, async () => {
        await importSharePayload(file.payload);
        throw new Error('Import failed');
      }),
    ).rejects.toThrow('Import failed');
    expect(await db.assets.count()).toBe(0);
    expect(await db.courses.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
});
