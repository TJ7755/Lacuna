import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCard,
  createCardWithReverse,
  createCourse,
  createCourseExamDate,
  createDeck,
  createLesson,
  createLessonCard,
  createNote,
  createSequence,
  updateDeck,
} from './repository';
import {
  buildCourseShareCode,
  buildCourseShareCodeQR,
  buildShareCode,
  decodeShare,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  summariseShare,
  type SharePayload,
  type SharePayloadV1,
} from './share';
import { assetUrl, storeImageBlob } from './assets';
import { bytesToBase45 } from './base45';

async function reset() {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.courseExamDates.clear(),
    db.sequences.clear(),
  ]);
}

/** Narrow a decoded payload to v1 for tests that build v1 codes directly. */
function asV1(payload: SharePayload): SharePayloadV1 {
  if (payload.v !== 1) throw new Error('expected a v1 (deck) payload');
  return payload;
}

describe('share codes', () => {
  beforeEach(reset);

  it('round-trips a deck, preserving content, cloze, colour and the date due', async () => {
    const deck = await createDeck('Chemistry');
    await updateDeck(deck.id, { examObjective: 'securedTopics', examDate: 1_900_000_000_000, colour: '#e11d48' });
    await createCard(deck.id, 'front_back', 'What is water?', 'H2O', ['basics']);
    await createCard(deck.id, 'cloze', 'The capital of France is {{c1::Paris}}.', '');

    const code = await buildShareCode([deck.id]);
    expect(code.startsWith('LAC1')).toBe(true);

    const payload = await decodeShare(code);
    const summary = summariseShare(payload);
    expect(summary.kind).toBe('deck');
    expect(summary.deckCount).toBe(1);
    expect(summary.cardCount).toBe(2);
    expect(summary.omittedImages).toBe(false);

    await importSharePayload(payload);

    const decks = await db.decks.toArray();
    expect(decks).toHaveLength(2); // original + imported
    const imported = decks.find((d) => d.id !== deck.id)!;
    expect(imported.name).toBe('Chemistry');
    expect(imported.examObjective).toBe('securedTopics');
    expect(imported.examDate).toBe(1_900_000_000_000);
    expect(imported.colour).toBe('#e11d48');

    const importedCards = await db.cards.where('deckId').equals(imported.id).toArray();
    expect(importedCards).toHaveLength(2);
    expect(importedCards.some((c) => c.type === 'cloze')).toBe(true);
    expect(importedCards.some((c) => c.front === 'What is water?' && c.back === 'H2O')).toBe(
      true,
    );
    // Imported cards start with clean scheduling state.
    expect(importedCards.every((c) => c.stability === null && c.reps === 0)).toBe(true);
  });

  it('round-trips a deck using the legacy LAC0 plain base64 format', async () => {
    const deck = await createDeck('Legacy');
    await createCard(deck.id, 'front_back', 'Q', 'A');

    const payload = asV1(await decodeShareDirect('LAC0' + btoa(JSON.stringify({ v: 1, by: null, at: Date.now(), decks: [{ n: 'Legacy', o: 0, c: 0, e: 0, cards: [{ k: 0, f: 'Q', b: 'A' }] }] }))));
    expect(payload.decks).toHaveLength(1);
    expect(payload.decks[0].cards[0].f).toBe('Q');
  });

  it('round-trips a deck using the legacy LAC1 compressed base64 format', async () => {
    const deck = await createDeck('LegacyCompressed');
    await createCard(deck.id, 'front_back', 'Q', 'A');

    const code = await buildShareCode([deck.id]);
    // Manually create a LAC1 code by re-encoding the payload
    const payload = await decodeShare(code);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
    const legacyCode = 'LAC1' + b64;

    const decoded = asV1(await decodeShare(legacyCode));
    expect(decoded.decks).toHaveLength(1);
    expect(decoded.decks[0].cards[0].f).toBe('Q');
  });

  it('compresses a reverse pair into one entry and expands it back into two cards', async () => {
    const deck = await createDeck('Vocab');
    await createCardWithReverse(deck.id, 'chien', 'dog');

    const payload = asV1(await decodeShare(await buildShareCode([deck.id])));
    // The two mirrored cards are stored as a single reversible entry.
    expect(payload.decks[0].cards).toHaveLength(1);
    expect(payload.decks[0].cards[0].k).toBe(2);
    expect(summariseShare(payload).cardCount).toBe(2);

    await importSharePayload(payload);
    const imported = (await db.decks.toArray()).find((d) => d.id !== deck.id)!;
    const cards = await db.cards.where('deckId').equals(imported.id).toArray();
    expect(cards).toHaveLength(2);
    expect(cards.some((c) => c.front === 'chien' && c.back === 'dog')).toBe(true);
    expect(cards.some((c) => c.front === 'dog' && c.back === 'chien')).toBe(true);
  });

  it('bundles several decks in one code', async () => {
    const a = await createDeck('One');
    const b = await createDeck('Two');
    await createCard(a.id, 'front_back', 'a', '1');
    await createCard(b.id, 'front_back', 'b', '2');

    const payload = await decodeShare(await buildShareCode([a.id, b.id]));
    expect(summariseShare(payload).deckCount).toBe(2);
    expect(summariseShare(payload).deckNames).toEqual(['One', 'Two']);
  });

  it('rejects a string that is not a share code', async () => {
    await expect(decodeShare('not a real code')).rejects.toThrow();
  });

  it('rejects a payload with a valid prefix but malformed nested structure', async () => {
    // A payload where a deck is missing the required `cards` array.
    const malformed = {
      v: 1,
      by: null,
      at: Date.now(),
      decks: [{ n: 'Bad deck', o: 0, c: 0, e: 0 }],
    };
    const plain = 'LAC3' + bytesToBase45(new TextEncoder().encode(JSON.stringify(malformed)));
    await expect(decodeShare(plain)).rejects.toThrow(/unsupported version/);
  });

  it('produces shorter codes with Base64 (LAC1) than Base45 (LAC2) for the same payload', async () => {
    const deck = await createDeck('Vocab');
    await createCard(deck.id, 'front_back', 'chien', 'dog');
    await createCard(deck.id, 'front_back', 'chat', 'cat');
    await createCard(deck.id, 'cloze', 'The capital of France is {{c1::Paris}}.', '');

    const code = await buildShareCode([deck.id]);
    expect(code.startsWith('LAC1')).toBe(true);

    // Manually build a Base45 equivalent (LAC2) to compare length.
    const payload = await decodeShare(code);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer();
    const base45Code = 'LAC2' + bytesToBase45(new Uint8Array(compressed));

    // Base64 must be shorter than Base45 for the same compressed payload.
    expect(code.length).toBeLessThan(base45Code.length);
  });

  it('strips images from share codes and imports placeholders gracefully', async () => {
    const deck = await createDeck('Image deck');
    const asset = await storeImageBlob(new Blob(['already-compressed'], { type: 'image/png' }), 'image/png', 100, 80);
    await createCard(deck.id, 'front_back', `Label\n![scan](${assetUrl(asset.hash)})`, 'Back text');

    const code = await buildShareCode([deck.id]);
    expect(code.length).toBeLessThan(800);

    const payload = await decodeShare(code);
    const summary = summariseShare(payload);
    expect(summary.omittedImages).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(asset.hash);
    expect(JSON.stringify(payload)).toContain('Image omitted from share code');

    await importSharePayload(payload);
    const imported = (await db.decks.toArray()).find((d) => d.id !== deck.id)!;
    const cards = await db.cards.where('deckId').equals(imported.id).toArray();
    expect(cards[0].front).toContain('Label');
    expect(cards[0].front).toContain('Image omitted from share code');
    expect(cards[0].back).toBe('Back text');
  });

  it('unpacks a legacy k:3 (typing) card as front_back for backward compatibility', async () => {
    const deck = await createDeck('Typing deck');
    const payload = asV1(await decodeShare(await buildShareCode([deck.id])));
    payload.decks[0].cards = [
      { k: 3, f: 'What is the capital of Japan?', b: 'Tokyo' },
    ];

    await importSharePayload(payload);
    const imported = (await db.decks.toArray()).find((d) => d.id !== deck.id)!;
    const cards = await db.cards.where('deckId').equals(imported.id).toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('front_back');
    expect(cards[0].front).toBe('What is the capital of Japan?');
    expect(cards[0].back).toBe('Tokyo');
  });

  it('imports a single shared deck as a single-lesson course, with cards stamped', async () => {
    const deck = await createDeck('Standalone');
    await createCard(deck.id, 'front_back', 'Q', 'A');

    const payload = await decodeShare(await buildShareCode([deck.id]));
    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(result.lessons).toBe(1);
    expect(result.cards).toBe(1);

    const courses = await db.courses.toArray();
    expect(courses).toHaveLength(1);
    expect(courses[0].name).toBe('Standalone');

    const lessons = await db.lessons.where('courseId').equals(courses[0].id).toArray();
    expect(lessons).toHaveLength(1);

    const stampedCards = await db.cards.where('primaryLessonId').equals(lessons[0].id).toArray();
    expect(stampedCards).toHaveLength(1);
    expect(stampedCards[0].courseId).toBe(courses[0].id);
  });

  it('imports several decks in one code as one course with N ordered lessons', async () => {
    const a = await createDeck('First');
    const b = await createDeck('Second');
    await createCard(a.id, 'front_back', 'a', '1');
    await createCard(b.id, 'front_back', 'b', '2');

    const payload = await decodeShare(await buildShareCode([a.id, b.id]));
    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(result.lessons).toBe(2);

    const courses = await db.courses.toArray();
    expect(courses).toHaveLength(1);

    const lessons = await db.lessons.where('courseId').equals(courses[0].id).sortBy('orderIndex');
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l.name)).toEqual(['First', 'Second']);
    expect(lessons[0].orderIndex).toBeLessThan(lessons[1].orderIndex);
  });
});

describe('course share codes (v2)', () => {
  beforeEach(reset);

  it('round-trips a course with lessons, notes, mixed card types and an exam date', async () => {
    const course = await createCourse('Biology', { unlockMode: 'semi-linear' });
    const lessonA = await createLesson(course.id, 'Cells');
    const lessonB = await createLesson(course.id, 'Genetics');

    await createNote(lessonA.id, 'Overview', 'Cells are the basic unit of life.');
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Front', 'Back');
    await createLessonCard(course.id, lessonA.id, 'cloze', 'The {{c1::mitochondria}} is the powerhouse.', '');
    await createLessonCard(course.id, lessonA.id, 'front_back', 'Name the organelle', 'Nucleus');

    await createNote(lessonB.id, 'Notes', 'DNA carries genetic information.');
    await createLessonCard(course.id, lessonB.id, 'front_back', 'chien', 'dog');
    // Manually add the mirrored card so packCards folds it into a reversible pair.
    await createLessonCard(course.id, lessonB.id, 'front_back', 'dog', 'chien');

    await createCourseExamDate(course.id, 'Mid-term', 2_000_000_000_000, { lessonIds: [lessonA.id] });

    const code = await buildCourseShareCode(course.id);
    const payload = await decodeShare(code);
    expect(payload.v).toBe(2);
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');

    expect(payload.course.n).toBe('Biology');
    expect(payload.course.um).toBe('semi-linear');
    expect(payload.lessons).toHaveLength(2);
    expect(payload.lessons.map((l) => l.n)).toEqual(['Cells', 'Genetics']);
    expect(payload.lessons[0].notes).toHaveLength(1);
    expect(payload.lessons[0].notes[0].c).toBe('Cells are the basic unit of life.');
    // The reversible pair in lesson B folds to a single k:2 entry.
    expect(payload.lessons[1].cards).toHaveLength(1);
    expect(payload.lessons[1].cards[0].k).toBe(2);
    expect(payload.exams).toHaveLength(1);
    expect(payload.exams![0].ls).toEqual([0]);

    const summary = summariseShare(payload);
    expect(summary.kind).toBe('course');
    expect(summary.courseName).toBe('Biology');
    expect(summary.lessonCount).toBe(2);
    expect(summary.cardCount).toBe(5); // front_back + cloze + front_back + reversible pair (2)

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(result.lessons).toBe(2);
    expect(result.cards).toBe(5);

    const importedCourses = await db.courses.toArray();
    const imported = importedCourses.find((c) => c.id !== course.id)!;
    expect(imported.name).toBe('Biology');
    expect(imported.unlockMode).toBe('semi-linear');
    // Imported courses default to study (read-only) mode, regardless of the
    // sharer's own lessonViewMode — the share payload never packs it.
    expect(imported.lessonViewMode).toBe('study');

    const importedLessons = await db.lessons.where('courseId').equals(imported.id).sortBy('orderIndex');
    expect(importedLessons.map((l) => l.name)).toEqual(['Cells', 'Genetics']);

    const notesA = await db.notes.where('lessonId').equals(importedLessons[0].id).toArray();
    expect(notesA).toHaveLength(1);
    expect(notesA[0].content).toBe('Cells are the basic unit of life.');

    const cardsA = await db.cards.where('primaryLessonId').equals(importedLessons[0].id).toArray();
    expect(cardsA).toHaveLength(3);
    expect(cardsA.some((c) => c.type === 'front_back' && c.front === 'Name the organelle' && c.back === 'Nucleus')).toBe(true);

    const cardsB = await db.cards.where('primaryLessonId').equals(importedLessons[1].id).toArray();
    expect(cardsB).toHaveLength(2);
    expect(cardsB.some((c) => c.front === 'chien' && c.back === 'dog')).toBe(true);
    expect(cardsB.some((c) => c.front === 'dog' && c.back === 'chien')).toBe(true);

    const importedExamDates = await db.courseExamDates.where('courseId').equals(imported.id).toArray();
    expect(importedExamDates).toHaveLength(1);
    expect(importedExamDates[0].name).toBe('Mid-term');
    expect(importedExamDates[0].lessonIds).toEqual([importedLessons[0].id]);
  });

  it('reflects image stripping in both notes and cards via summariseShare', async () => {
    const course = await createCourse('Anatomy');
    const lesson = await createLesson(course.id, 'Skeleton');
    const asset = await storeImageBlob(new Blob(['img'], { type: 'image/png' }), 'image/png', 50, 50);
    await createNote(lesson.id, 'Diagram', `See scan\n![scan](${assetUrl(asset.hash)})`);
    await createLessonCard(course.id, lesson.id, 'front_back', `Label\n![x](${assetUrl(asset.hash)})`, 'Back');

    const payload = await decodeShare(await buildCourseShareCode(course.id));
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');
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
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');

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
    const positional = await db.cards.where('sequenceItemId').equals(importedLithiumItem.id).first();
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
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');

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
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');

    expect(payload.sequences).toHaveLength(1);
    expect(payload.sequences![0].n).toBe('Group 1 metals');

    await importSharePayload(payload);

    // Two originals (lesson-scoped + bank-scoped) already exist pre-import; the import
    // should only ever add the lesson-scoped one back, never a second bank sequence.
    const allSequences = await db.sequences.toArray();
    expect(allSequences.filter((s) => s.name === 'Group 1 metals')).toHaveLength(2);
    expect(allSequences.filter((s) => s.name === 'Bank sequence')).toHaveLength(1);
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
      lessons: [
        { n: 'Lesson 1', notes: [], cards: [{ k: 0 as const, f: 'Q', b: 'A' }] },
      ],
    };

    const code = await encodeShareDirect(legacyPayload);
    const payload = await decodeShare(code);
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');
    expect(payload.sequences).toBeUndefined();
    expect(payload.lessons).toHaveLength(1);

    const result = await importSharePayload(payload);
    expect(result.courses).toBe(1);
    expect(await db.sequences.count()).toBe(0);
  });
});

describe('QR share codes', () => {
  beforeEach(reset);

  it('generates a QR-ready Base45 code (LAC2) for a course and round-trips it', async () => {
    const course = await createCourse('QR Vocab');
    const lesson = await createLesson(course.id, 'Greetings');
    await createLessonCard(course.id, lesson.id, 'front_back', 'bonjour', 'hello');
    await createLessonCard(course.id, lesson.id, 'cloze', 'The capital of Spain is {{c1::Madrid}}.', '');

    const qrCode = await buildCourseShareCodeQR(course.id);
    expect(qrCode.startsWith('LAC2')).toBe(true);

    const payload = await decodeShare(qrCode);
    if (payload.v !== 2) throw new Error('expected a v2 (course) payload');
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
    if (decoded.v !== 2) throw new Error('expected a v2 (course) payload');
    expect(decoded.lessons).toHaveLength(1);
    expect(decoded.lessons[0].cards[0].f).toBe('Q');
  });
});
