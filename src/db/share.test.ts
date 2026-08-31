import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createCourseCard,
  createLesson,
  createLessonCard,
  createLessonCardWithReverse,
  createNote,
  linkCardToLesson,
  createSequence,
  updateCourse,
} from './repository';
import { createOcclusion } from './occlusionRepository';
import {
  buildCourseShareCode,
  buildCourseShareCodeQR,
  decodeShare,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  summariseShare,
  V1_SHARE_CODE_MESSAGE,
  type SharePayload,
  type SharePayloadV1,
} from './share';
import { assetUrl, storeAudioBlob, storeImageBlob } from './assets';
import { bytesToBase45 } from './base45';
import type { ItemPayload } from './types';
import {
  createConcept,
  createFixedQuestion,
  createGeneratedQuestion,
} from '../questions/repository';

async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.occlusions.clear(),
    db.concepts.clear(),
    db.questions.clear(),
    db.questionConcepts.clear(),
    db.questionAttempts.clear(),
    db.tombstones.clear(),
  ]);
}

function v1Payload(): SharePayloadV1 {
  return {
    v: 1,
    by: null,
    at: Date.now(),
    decks: [{ n: 'Old deck', o: 0, c: 0, e: 0, cards: [{ k: 0, f: 'Q', b: 'A' }] }],
  };
}

function v2Payload(
  cards: Array<{ k: 0 | 1 | 2 | 3; f: string; b?: string }> = [{ k: 0, f: 'Q', b: 'A' }],
): SharePayload {
  return {
    v: 2,
    by: null,
    at: Date.now(),
    course: { n: 'Shared', o: 0, c: 0, e: 0, um: 'open' },
    lessons: [{ n: 'Lesson', notes: [], cards }],
  };
}

describe('share codes', () => {
  beforeEach(reset);

  it('refuses a v1 deck share code at decode and import', async () => {
    const payload = v1Payload();
    const code = await encodeShareDirect(payload);
    await expect(decodeShare(code)).rejects.toThrow(V1_SHARE_CODE_MESSAGE);
    await expect(decodeShareDirect(code)).rejects.toThrow(V1_SHARE_CODE_MESSAGE);
    await expect(importSharePayload(payload)).rejects.toThrow(V1_SHARE_CODE_MESSAGE);
  });

  it('round-trips a course using the legacy LAC0 plain base64 format', async () => {
    const payload = v2Payload();
    const decoded = await decodeShareDirect('LAC0' + btoa(JSON.stringify(payload)));
    expect(decoded.v).toBe(2);
    if (decoded.v === 1) throw new Error('expected a course payload');
    expect(decoded.lessons[0].cards[0].f).toBe('Q');
  });

  it('round-trips a course using the LAC1 compressed base64 format', async () => {
    const course = await createCourse('Compressed');
    const lesson = await createLesson(course.id, 'Lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');

    const code = await buildCourseShareCode(course.id);
    expect(code.startsWith('LAC1')).toBe(true);

    const payload = await decodeShare(code);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
    const recompressed = 'LAC1' + b64;

    const decoded = await decodeShare(recompressed);
    expect(decoded.v).toBe(3);
    if (decoded.v === 1) throw new Error('expected a course payload');
    expect(decoded.lessons[0].cards[0].f).toBe('Q');
  });

  it('rejects a string that is not a share code', async () => {
    await expect(decodeShare('not a real code')).rejects.toThrow();
  });

  it('rejects a payload with a valid prefix but malformed nested structure', async () => {
    const malformed = {
      v: 2,
      by: null,
      at: Date.now(),
      course: { n: 'Bad course', o: 0, c: 0, e: 0 },
    };
    const plain = 'LAC3' + bytesToBase45(new TextEncoder().encode(JSON.stringify(malformed)));
    await expect(decodeShare(plain)).rejects.toThrow(/unsupported version/);
  });

  it('rejects a working item with no mark-scheme lines', async () => {
    const malformed = {
      v: 2,
      by: null,
      at: Date.now(),
      course: { n: 'Malformed item', o: 0, c: 0, e: 0, um: 'open' },
      lessons: [
        {
          n: 'Lesson',
          notes: [],
          cards: [{ k: 0, f: 'Solve 2x = 8.', b: '', p: { v: 1, kind: 'working', scheme: [] } }],
        },
      ],
    };
    const plain = 'LAC3' + bytesToBase45(new TextEncoder().encode(JSON.stringify(malformed)));
    await expect(decodeShare(plain)).rejects.toThrow(/unsupported version/);
  });

  it('produces shorter codes with Base64 (LAC1) than Base45 (LAC2) for the same payload', async () => {
    const course = await createCourse('Vocab');
    const lesson = await createLesson(course.id, 'Words');
    await createLessonCard(course.id, lesson.id, 'front_back', 'chien', 'dog');
    await createLessonCard(course.id, lesson.id, 'front_back', 'chat', 'cat');
    await createLessonCard(
      course.id,
      lesson.id,
      'cloze',
      'The capital of France is {{c1::Paris}}.',
      '',
    );

    const code = await buildCourseShareCode(course.id);
    expect(code.startsWith('LAC1')).toBe(true);

    const payload = await decodeShare(code);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer();
    const base45Code = 'LAC2' + bytesToBase45(new Uint8Array(compressed));

    expect(code.length).toBeLessThan(base45Code.length);
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

  it('unpacks a legacy k:3 (typing) card as front_back for backward compatibility', async () => {
    const payload = v2Payload([{ k: 3, f: 'What is the capital of Japan?', b: 'Tokyo' }]);
    await importSharePayload(payload);
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('front_back');
    expect(cards[0].front).toBe('What is the capital of Japan?');
    expect(cards[0].back).toBe('Tokyo');
  });
});

describe('course share codes (v2)', () => {
  it('round-trips a steady-retention target without inventing a date', async () => {
    const course = await createCourse('Spanish', { schedulingMode: 'steady' });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.course.sm).toBe(1);
    expect(payload.course.e).toBeUndefined();
    expect(payload.exams?.find((assessment) => assessment.k === 'f')).toMatchObject({ sm: 1 });

    await reset();
    const result = await importSharePayload(payload);
    const [importedFinal] = await db.courseAssessments
      .where('courseId')
      .equals(result.courseIds[0])
      .toArray();
    expect(importedFinal).toMatchObject({ kind: 'final', schedulingMode: 'steady' });
    expect(importedFinal).not.toHaveProperty('examDate');
    expect(await db.schedulingUnits.get(result.courseIds[0])).not.toHaveProperty('examDate');
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
    if (payload.v === 1) throw new Error('expected a course payload');
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
    if (payload.v === 1) throw new Error('expected a course payload');
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
    if (payload.v === 1) throw new Error('expected a course payload');
    const futurePayload = { v: 2, kind: 'proof-tree', nodes: [{ statement: 'A' }] };
    payload.lessons[0].cards[0].p = futurePayload;

    const decoded = await decodeShareDirect(await encodeShareDirect(payload));
    if (decoded.v === 1) throw new Error('expected a course payload');
    expect(decoded.lessons[0].cards[0].p).toEqual(futurePayload);

    const unknownKind = { v: 1, kind: 'proof-tree', nodes: [{ statement: 'B' }] };
    decoded.lessons[0].cards[0].p = unknownKind;
    const decodedUnknownKind = await decodeShareDirect(await encodeShareDirect(decoded));
    if (decodedUnknownKind.v === 1) throw new Error('expected a course payload');
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
    if (payload.v === 1) throw new Error('expected a course payload');
    Object.assign(payload.lessons[0].cards[0], { p: { v: 1, kind: 'numeric' } });

    await expect(decodeShareDirect(await encodeShareDirect(payload))).rejects.toThrow(
      /unsupported version/,
    );
  });

  beforeEach(reset);

  it('round-trips a course with lessons, notes, mixed card types and an exam date', async () => {
    const course = await createCourse('Biology', { unlockMode: 'semi-linear' });
    const lessonA = await createLesson(course.id, 'Cells');
    const lessonB = await createLesson(course.id, 'Genetics');

    await createNote(lessonA.id, 'Overview', 'Cells are the basic unit of life.');
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Front', 'Back');
    await createLessonCard(
      course.id,
      lessonA.id,
      'cloze',
      'The {{c1::mitochondria}} is the powerhouse.',
      '',
    );
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Name the organelle', 'Nucleus');

    await createNote(lessonB.id, 'Notes', 'DNA carries genetic information.');
    await createLessonCard(course.id, lessonB.id, 'front_back', 'chien', 'dog');
    // Mirrored cards stay distinct in course shares so assessment exclusions can target either id.
    await createLessonCard(course.id, lessonB.id, 'front_back', 'dog', 'chien');

    await createCourseAssessment(course.id, 'Mid-term', 2_000_000_000_000, {
      afterLessonId: lessonA.id,
      coverageMode: 'custom',
      lessonIds: [lessonA.id],
    });

    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    expect(payload.v).toBe(3);
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.course.n).toBe('Biology');
    expect(payload.course.um).toBe('semi-linear');
    expect(payload.lessons).toHaveLength(2);
    expect(payload.lessons.map((l) => l.n)).toEqual(['Cells', 'Genetics']);
    expect(payload.lessons[0].notes).toHaveLength(1);
    expect(payload.lessons[0].notes[0].c).toBe('Cells are the basic unit of life.');
    expect(payload.lessons[1].cards).toHaveLength(2);
    expect(payload.exams).toHaveLength(2);
    expect(payload.exams!.find((assessment) => assessment.k === 'c')?.ls).toEqual([0]);

    const summary = summariseShare(payload);
    expect(summary.kind).toBe('course');
    expect(summary.courseName).toBe('Biology');
    expect(summary.lessonCount).toBe(2);
    expect(summary.noteCount).toBe(2);
    expect(summary.cardCount).toBe(5); // front_back + cloze + front_back + reversible pair (2)

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(result.lessons).toBe(2);
    expect(result.cards).toBe(5);

    const importedCourses = await db.courses.toArray();
    const imported = importedCourses.find((c) => c.id !== course.id)!;
    expect(result.courseIds).toEqual([imported.id]);
    expect(imported.name).toBe('Biology');
    expect(imported.unlockMode).toBe('semi-linear');
    // Imported courses default to study (read-only) mode, regardless of the
    // sharer's own lessonViewMode — the share payload never packs it.
    expect(imported.lessonViewMode).toBe('study');

    const importedLessons = await db.lessons
      .where('courseId')
      .equals(imported.id)
      .sortBy('orderIndex');
    expect(importedLessons.map((l) => l.name)).toEqual(['Cells', 'Genetics']);

    const notesA = await db.notes.where('lessonId').equals(importedLessons[0].id).toArray();
    expect(notesA).toHaveLength(1);
    expect(notesA[0].content).toBe('Cells are the basic unit of life.');

    const cardsA = await db.cards.where('primaryLessonId').equals(importedLessons[0].id).toArray();
    expect(cardsA).toHaveLength(3);
    expect(
      cardsA.some(
        (c) => c.type === 'front_back' && c.front === 'Name the organelle' && c.back === 'Nucleus',
      ),
    ).toBe(true);

    const cardsB = await db.cards.where('primaryLessonId').equals(importedLessons[1].id).toArray();
    expect(cardsB).toHaveLength(2);
    expect(cardsB.some((c) => c.front === 'chien' && c.back === 'dog')).toBe(true);
    expect(cardsB.some((c) => c.front === 'dog' && c.back === 'chien')).toBe(true);

    const importedAssessments = await db.courseAssessments
      .where('courseId')
      .equals(imported.id)
      .toArray();
    expect(importedAssessments).toHaveLength(2);
    const importedCheckpoint = importedAssessments.find(
      (assessment) => assessment.kind === 'checkpoint',
    );
    expect(importedCheckpoint?.name).toBe('Mid-term');
    expect(importedCheckpoint?.coverageMode).toBe('custom');
    if (importedCheckpoint?.coverageMode !== 'custom') {
      throw new Error('expected custom coverage');
    }
    expect(importedCheckpoint.lessonIds).toEqual([importedLessons[0].id]);
  });

  it('preserves full assessment semantics and ids through an empty-database round-trip', async () => {
    const course = await createCourse('Chemistry');
    const lessonA = await createLesson(course.id, 'Atoms');
    const lessonB = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lessonA.id, 'front_back', 'Proton', 'Positive');
    const checkpoint = await createCourseAssessment(course.id, 'Paper 1', 2_000_000_000_000, {
      afterLessonId: lessonB.id,
      coverageMode: 'custom',
      lessonIds: [lessonA.id],
      excludedCardIds: [card.id],
      needsAuthorConfirmation: true,
    });
    const originalFinal = (
      await db.courseAssessments.where('courseId').equals(course.id).toArray()
    ).find((assessment) => assessment.kind === 'final')!;
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    await reset();
    await importSharePayload(payload);

    const assessments = await db.courseAssessments.toArray();
    const importedCheckpoint = assessments.find((assessment) => assessment.kind === 'checkpoint')!;
    const importedFinal = assessments.find((assessment) => assessment.kind === 'final')!;
    const importedLessons = await db.lessons.orderBy('orderIndex').toArray();
    const importedCard = (await db.cards.toArray()).find((entry) => entry.front === 'Proton')!;
    expect(importedFinal.id).toBe(originalFinal.id);
    expect(importedCheckpoint).toEqual(
      expect.objectContaining({
        id: checkpoint.id,
        afterLessonId: importedLessons[1].id,
        coverageMode: 'custom',
        lessonIds: [importedLessons[0].id],
        excludedCardIds: [importedCard.id],
        needsAuthorConfirmation: true,
      }),
    );
  });

  it('preserves linked bank-card assessment membership and exclusions', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Atoms');
    const bankCard = await createCourseCard(course.id, 'front_back', 'Neutron', 'Neutral');
    await linkCardToLesson(lesson.id, bankCard.id);
    await createCourseAssessment(course.id, 'Paper 1', 2_000_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'prefix',
      excludedCardIds: [bankCard.id],
    });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    await reset();
    await importSharePayload(payload);

    const importedLesson = (await db.lessons.toArray())[0];
    const importedCard = (await db.cards.toArray()).find((card) => card.front === 'Neutron')!;
    const importedCheckpoint = (await db.courseAssessments.toArray()).find(
      (assessment) => assessment.kind === 'checkpoint',
    )!;
    expect(importedCard.primaryLessonId).toBeNull();
    expect(await db.lessonCards.where('lessonId').equals(importedLesson.id).first()).toEqual(
      expect.objectContaining({ cardId: importedCard.id }),
    );
    expect(importedCheckpoint.excludedCardIds).toEqual([importedCard.id]);
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
    if (payload.v === 1) throw new Error('expected a course payload');
    expect(payload.lessons[0].notes[0].i).toBe(1);
    expect(payload.lessons[0].cards[0].i).toBe(1);

    const summary = summariseShare(payload);
    expect(summary.omittedImages).toBe(true);
  });

  it('round-trips a course with a sequence and its generated cards, incl. a label card', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Periodic table');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Group 1 metals',
      [
        { id: 'item-li', value: 'Lithium', label: '3' },
        { id: 'item-na', value: 'Sodium', label: '11' },
      ],
      { generateLabelCards: true },
    );

    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].n).toBe('Group 1 metals');
    expect(payload.sequences![0].items).toHaveLength(2);
    expect(payload.sequences![0].lc).toBe(1);
    // Positional + label cards for both items = 4 shared cards, each carrying `si`.
    expect(payload.lessons[0].cards).toHaveLength(4);
    expect(payload.lessons[0].cards.every((c) => typeof c.si === 'string')).toBe(true);
    expect(payload.lessons[0].cards.some((c) => c.si === 'item-li::label')).toBe(true);

    await importSharePayload(payload);

    const importedSequences = await db.sequences.toArray();
    const imported = importedSequences.find((s) => s.id !== sequence.id)!;
    expect(imported.name).toBe('Group 1 metals');
    expect(imported.generateLabelCards).toBe(true);
    expect(imported.items).toHaveLength(2);
    // Item ids are freshly minted, not reused from the original sequence.
    expect(imported.items.map((i) => i.id)).not.toContain('item-li');

    const importedLithiumItem = imported.items.find((i) => i.value === 'Lithium')!;
    const positional = await db.cards
      .where('sequenceItemId')
      .equals(importedLithiumItem.id)
      .first();
    const labelCard = await db.cards
      .where('sequenceItemId')
      .equals(`${importedLithiumItem.id}::label`)
      .first();
    expect(positional).toBeDefined();
    expect(labelCard).toBeDefined();
    expect(positional!.back).toBe('Lithium');
    expect(labelCard!.back).toBe('Lithium');
  });

  it('round-trips a lines-mode sequence with speaker-tagged items and mySpeaker', async () => {
    const course = await createCourse('Drama');
    const lesson = await createLesson(course.id, 'Scene one');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Scene one',
      [
        { id: 'l1', value: 'Hello there.', speaker: 'BOB' },
        { id: 'l2', value: 'General Kenobi.', speaker: 'ALICE' },
      ],
      { mode: 'lines', mySpeaker: 'ALICE' },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].m).toBe('lines');
    expect(payload.sequences![0].ms).toBe('ALICE');
    expect(payload.sequences![0].items.map((i) => i.sp)).toEqual(['BOB', 'ALICE']);
    // Only ALICE's line generates a card.
    expect(payload.lessons[0].cards).toHaveLength(1);

    await importSharePayload(payload);

    const importedSequences = await db.sequences.toArray();
    const imported = importedSequences.find((s) => s.id !== sequence.id)!;
    expect(imported.mode).toBe('lines');
    expect(imported.mySpeaker).toBe('ALICE');
    expect(imported.items.map((i) => i.speaker)).toEqual(['BOB', 'ALICE']);
  });

  it('round-trips a speakerless lines-mode sequence, omitting the preset id when it matches the m/ms inference', async () => {
    const course = await createCourse('Poetry');
    const lesson = await createLesson(course.id, 'Sonnets');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Sonnet 18',
      [{ id: 'l1', value: 'Shall I compare thee to a summer’s day?' }],
      { mode: 'lines', presetId: 'poetry' },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].m).toBe('lines');
    expect(payload.sequences![0].ms).toBeUndefined();
    // presetForSequence already infers 'poetry' from mode 'lines' + no mySpeaker, so
    // the id itself doesn't need to travel.
    expect(payload.sequences![0].pr).toBeUndefined();

    await importSharePayload(payload);
    const imported = (await db.sequences.toArray()).find((s) => s.id !== sequence.id)!;
    expect(imported.presetId).toBeUndefined();
  });

  it('round-trips the preset id when it cannot be re-inferred from mode/mySpeaker (speech vs. poetry)', async () => {
    const course = await createCourse('Rhetoric');
    const lesson = await createLesson(course.id, 'Gettysburg Address');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Opening lines',
      [{ id: 'l1', value: 'Four score and seven years ago…' }],
      { mode: 'lines', presetId: 'speech' },
    );

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences![0].pr).toBe('speech');

    await importSharePayload(payload);
    const imported = (await db.sequences.toArray()).find((s) => s.id !== sequence.id)!;
    expect(imported.presetId).toBe('speech');
  });

  it('excludes bank-scoped sequences from a course share while lesson-scoped ones still round-trip', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Periodic table');
    await createSequence(course.id, lesson.id, 'Group 1 metals', [
      { id: 'item-li', value: 'Lithium', label: '3' },
      { id: 'item-na', value: 'Sodium', label: '11' },
    ]);
    // A sequence created from the Question Bank has no primary lesson, and its
    // generated cards (also primaryLessonId null) are never packed into a share —
    // so the sequence itself must be excluded too, or it would import with no cards.
    await createSequence(course.id, null, 'Bank sequence', [
      { id: 'item-k', value: 'Potassium', label: '19' },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].n).toBe('Group 1 metals');

    await importSharePayload(payload);

    // Two originals (lesson-scoped + bank-scoped) already exist pre-import; the import
    // should only ever add the lesson-scoped one back, never a second bank sequence.
    const allSequences = await db.sequences.toArray();
    expect(allSequences.filter((s) => s.name === 'Group 1 metals')).toHaveLength(2);
    expect(allSequences.filter((s) => s.name === 'Bank sequence')).toHaveLength(1);
  });

  it('round-trips an occlusion, remapping region ids and pairings', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    const occlusion = await createOcclusion(course.id, lesson.id, 'Plant cell', asset.hash, [
      {
        id: 'region-nucleus',
        role: 'label',
        shape: 'rectangle',
        x: 0.1,
        y: 0.1,
        w: 0.2,
        h: 0.1,
        answerText: 'Nucleus',
      },
      {
        id: 'region-arrow',
        role: 'feature',
        shape: 'rectangle',
        x: 0.5,
        y: 0.4,
        w: 0.1,
        h: 0.1,
        pairedRegionId: 'region-nucleus',
        backNote: 'Contains the DNA.',
      },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.occlusions).toHaveLength(1);
    expect(payload.occlusions![0].n).toBe('Plant cell');
    expect(payload.occlusions![0].ah).toBe(asset.hash);
    expect(payload.occlusions![0].regions.map((r) => r.r)).toEqual([0, 1]);
    // One card per region, each carrying its `oc` reference.
    expect(payload.lessons[0].cards).toHaveLength(2);
    expect(payload.lessons[0].cards.every((c) => typeof c.oc === 'string')).toBe(true);

    await importSharePayload(payload);

    const imported = (await db.occlusions.toArray()).find((o) => o.id !== occlusion.id)!;
    expect(imported.name).toBe('Plant cell');
    expect(imported.assetHash).toBe(asset.hash);
    expect(imported.regions).toHaveLength(2);
    // Region ids are freshly minted, and the pairing follows them.
    expect(imported.regions.map((r) => r.id)).not.toContain('region-nucleus');
    const label = imported.regions.find((r) => r.role === 'label')!;
    const feature = imported.regions.find((r) => r.role === 'feature')!;
    expect(feature.pairedRegionId).toBe(label.id);
    expect(feature.backNote).toBe('Contains the DNA.');
    expect(label.shape).toBe('rectangle');
    expect(label.x).toBe(0.1);
    // The generated cards point at the remapped region ids.
    expect(await db.cards.where('occlusionRegionId').equals(label.id).count()).toBe(1);
    expect(await db.cards.where('occlusionRegionId').equals(feature.id).count()).toBe(1);
  });

  it('excludes bank-scoped occlusions from a course share', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    await createOcclusion(course.id, lesson.id, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    ]);
    // Bank-scoped, like the sequence case above: its generated cards are never packed,
    // so the occlusion must not travel either or it would import with no cards.
    await createOcclusion(course.id, null, 'Bank diagram', asset.hash, [
      { id: 'region-2', role: 'label', shape: 'rectangle', x: 0.3, y: 0.3, w: 0.2, h: 0.1 },
    ]);

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.occlusions).toHaveLength(1);
    expect(payload.occlusions![0].n).toBe('Plant cell');

    await importSharePayload(payload);

    const all = await db.occlusions.toArray();
    expect(all.filter((o) => o.name === 'Plant cell')).toHaveLength(2);
    expect(all.filter((o) => o.name === 'Bank diagram')).toHaveLength(1);
  });

  it('parses an old v2 payload with no sequences field', async () => {
    const legacyPayload = {
      v: 2 as const,
      by: null,
      at: Date.now(),
      course: {
        n: 'Legacy course',
        o: 0 as const,
        c: 0,
        e: 0,
        um: 'linear' as const,
      },
      lessons: [{ n: 'Lesson 1', notes: [], cards: [{ k: 0 as const, f: 'Q', b: 'A' }] }],
    };

    const code = await encodeShareDirect(legacyPayload);
    const payload = await decodeShare(code);
    if (payload.v === 1) throw new Error('expected a course payload');
    expect(payload.sequences).toBeUndefined();
    expect(payload.occlusions).toBeUndefined();
    expect(payload.lessons).toHaveLength(1);

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(await db.sequences.count()).toBe(0);
    expect(await db.occlusions.count()).toBe(0);
  });

  it('omits li/rv and per-entity originating ids for a course that has never published', async () => {
    const course = await createCourse('Geology');
    const lesson = await createLesson(course.id, 'Rocks');
    await createNote(lesson.id, 'Overview', 'Igneous, sedimentary, metamorphic.');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Front', 'Back');

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v === 1) throw new Error('expected a course payload');

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
    if (payload.v === 1) throw new Error('expected a course payload');

    expect(payload.li).toBe('lin_1');
    expect(payload.rv).toBe(3);
    expect(payload.lessons[0].i).toBe(lesson.id);
    expect(payload.lessons[0].notes[0].oi).toBe(note.id);
    expect(payload.lessons[0].cards[0].id).toBe(card.id);
    expect(payload.bankCards?.[0].id).toBe(bankCard.id);
  });

  it('decodes li/rv and originating ids, and tolerates their absence (schema validation)', async () => {
    const publishedPayload = {
      v: 2 as const,
      by: null,
      at: Date.now(),
      course: { n: 'Course', o: 0 as const, c: 0, e: 0, um: 'linear' as const },
      lessons: [
        {
          n: 'Lesson 1',
          i: 'lesson-orig-id',
          notes: [{ n: 'Note 1', c: 'Content', oi: 'note-orig-id' }],
          cards: [{ id: 'card-orig-id', k: 0 as const, f: 'Q', b: 'A' }],
        },
      ],
      li: 'lin_abc',
      rv: 2,
    };
    const code = await encodeShareDirect(publishedPayload);
    const decoded = await decodeShare(code);
    if (decoded.v === 1) throw new Error('expected a course payload');
    expect(decoded.li).toBe('lin_abc');
    expect(decoded.rv).toBe(2);
    expect(decoded.lessons[0].i).toBe('lesson-orig-id');
    expect(decoded.lessons[0].notes[0].oi).toBe('note-orig-id');
    expect(decoded.lessons[0].cards[0].id).toBe('card-orig-id');

    // A plain payload with none of the new fields still parses cleanly.
    const plainPayload = {
      v: 2 as const,
      by: null,
      at: Date.now(),
      course: { n: 'Course', o: 0 as const, c: 0, e: 0, um: 'linear' as const },
      lessons: [{ n: 'Lesson 1', notes: [], cards: [{ k: 0 as const, f: 'Q', b: 'A' }] }],
    };
    const plainDecoded = await decodeShare(await encodeShareDirect(plainPayload));
    if (plainDecoded.v === 1) throw new Error('expected a course payload');
    expect(plainDecoded.li).toBeUndefined();
    expect(plainDecoded.rv).toBeUndefined();
    expect(plainDecoded.lessons[0].i).toBeUndefined();
  });

  it('round-trips v3 Concepts, alternate Card presentations and Question definitions without learner state', async () => {
    const course = await createCourse('Algebra applications');
    const lesson = await createLesson(course.id, 'Equations');
    const target = await createConcept(course.id, 'Solve equations');
    const prerequisite = await createConcept(course.id, 'Collect terms');
    const pair = await createLessonCardWithReverse(
      course.id,
      lesson.id,
      'Equation',
      'Unknown value',
    );
    await db.cards.update(pair.card.id, { conceptId: target.id });
    await db.cards.update(pair.reverse.id, { conceptId: target.id });
    await createFixedQuestion({
      courseId: course.id,
      primaryLessonId: lesson.id,
      name: 'Linear equation',
      prompt: 'Solve $2x = 8$.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
      explanation: 'Divide both sides by 2.',
      targetConceptId: target.id,
      prerequisiteConceptIds: [prerequisite.id],
    });
    await createGeneratedQuestion({
      courseId: course.id,
      name: 'Quadratic family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: {
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 2,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      },
      targetConceptId: target.id,
    });

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    expect(payload.v).toBe(3);
    if (payload.v !== 3) throw new Error('expected a v3 course payload');
    expect(payload.questions).toHaveLength(2);
    expect(payload.concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining([target.id, prerequisite.id]),
    );
    expect(new Set(payload.lessons[0].cards.map((card) => card.co)).size).toBe(1);
    expect(JSON.stringify(payload)).not.toContain('scheduleEpoch');
    expect(JSON.stringify(payload)).not.toContain('questionAttempts');

    await reset();
    const result = await importSharePayload(payload);
    expect(result.questions).toBe(2);
    expect(await db.questionAttempts.count()).toBe(0);
    const importedQuestions = await db.questions.toArray();
    expect(importedQuestions).toHaveLength(2);
    expect(importedQuestions.every((question) => question.reps === 0)).toBe(true);
    const importedSet = await db.questionConcepts.get(
      importedQuestions.find((question) => question.kind === 'fixed')!.id,
    );
    expect(importedSet?.targetConceptIds).toHaveLength(1);
    expect(importedSet?.prerequisiteConceptIds).toHaveLength(1);
    const importedCards = await db.cards.toArray();
    expect(new Set(importedCards.map((card) => card.conceptId)).size).toBe(1);
  });

  it('preserves an unknown generated family safely as suspended content', async () => {
    const course = await createCourse('Future generators');
    const target = await createConcept(course.id, 'Future skill');
    await createGeneratedQuestion({
      courseId: course.id,
      name: 'Known family',
      generatorKey: 'integer-root-quadratic',
      generatorVersion: 1,
      generatorConfig: {
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 1,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      },
      targetConceptId: target.id,
    });
    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v !== 3) throw new Error('expected a v3 course payload');
    const generated = payload.questions.find((question) => question.k === 1)!;
    generated.gk = 'future-family';
    generated.gv = 99;

    await reset();
    await importSharePayload(await decodeShare(await encodeShareDirect(payload)));
    expect(await db.questions.toCollection().first()).toMatchObject({
      kind: 'generated',
      generatorKey: 'future-family',
      generatorVersion: 99,
      suspended: true,
    });
  });
});

describe('QR share codes', () => {
  beforeEach(reset);

  it('generates a QR-ready Base45 code (LAC2) for a course and round-trips it', async () => {
    const course = await createCourse('QR Vocab');
    const lesson = await createLesson(course.id, 'Greetings');
    await createLessonCard(course.id, lesson.id, 'front_back', 'bonjour', 'hello');
    await createLessonCard(
      course.id,
      lesson.id,
      'cloze',
      'The capital of Spain is {{c1::Madrid}}.',
      '',
    );

    const qrCode = await buildCourseShareCodeQR(course.id);
    expect(qrCode.startsWith('LAC2')).toBe(true);

    const payload = await decodeShare(qrCode);
    if (payload.v === 1) throw new Error('expected a course payload');
    expect(payload.lessons).toHaveLength(1);
    expect(payload.lessons[0].cards).toHaveLength(2);
    const fronts = payload.lessons[0].cards.map((c) => c.f);
    expect(fronts).toContain('bonjour');
    expect(fronts.some((f) => f.includes('Madrid'))).toBe(true);

    await importSharePayload(payload);
    const courses = await db.courses.toArray();
    expect(courses).toHaveLength(2);
  });

  it('produces a Base45 course code that is readable by the unified decoder', async () => {
    const course = await createCourse('Unified');
    const lesson = await createLesson(course.id, 'Basics');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');

    const qrCode = await buildCourseShareCodeQR(course.id);
    expect(qrCode.startsWith('LAC2')).toBe(true);

    const decoded = await decodeShareDirect(qrCode);
    if (decoded.v === 1) throw new Error('expected a course payload');
    expect(decoded.lessons).toHaveLength(1);
    expect(decoded.lessons[0].cards[0].f).toBe('Q');
  });
});
