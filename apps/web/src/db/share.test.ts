import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, createLesson, createLessonCard } from './repository';
import {
  buildCourseShareCode,
  buildCourseShareCodeQR,
  decodeShare,
  decodeShareDirect,
  encodeShareDirect,
  importSharePayload,
  V1_SHARE_CODE_MESSAGE,
} from './share';
import { bytesToBase45 } from './base45';
import { reset, v1Payload, v2Payload } from './share.testFixtures';

describe('share code formats and validation', () => {
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
    expect(decoded.v).toBe(6);
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
