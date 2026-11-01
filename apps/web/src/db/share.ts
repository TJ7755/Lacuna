// Deck/course sharing: turn one or more decks' content, or a whole course, into a
// single compact, copy-and-paste code, and rebuild it from such a code. A share code
// carries only the *content* needed to recreate the material (type, front, back, tags
// — images ride along inside the Markdown as base64 data URIs — plus, for a course,
// its lessons, notes and assessments) alongside light scheduling metadata (name,
// objective, the date it was created and the date due). It deliberately omits personal
// scheduling state and review history: sharing is about the material, not one
// learner's progress.
//
// Compression comes from three places, in order of impact:
//   1. Reverse pairs (a front/back card and its mirror) are stored once as a single
//      "reversible" entry and expanded back into two independent cards on import — the
//      same shape createCardWithReverse produces.
//   2. Compact single-letter JSON keys.
//   3. DEFLATE (via the native CompressionStream) before encoding, when available.
//
// Encoding uses Base45 (RFC 9285) for the new format because it maps exactly to the
// QR code Alphanumeric mode, giving ~30% more capacity than Base64. Legacy codes
// using Base64 are still read for backward compatibility.
//
// The resulting string is a short scheme tag followed by the encoded payload:
//   LAC1 = DEFLATE + base64 (default — shortest for copy-paste text)
//   LAC0 = plain base64 (legacy, uncompressed fallback)
//   LAC2 = DEFLATE + Base45 (densest in QR codes, longer as raw text)
//   LAC3 = plain Base45 (legacy, uncompressed fallback)
//
// Payload version (the `v` field, unrelated to the LACn encoding prefix above):
//   v1 = a flat list of decks. Still parsed so an old code can be named, then refused.
//   v2 = a single course: course metadata, ordered lessons, cards, assessment scope
//        references and lesson-card links. PracticeNode remains device-local.
//   v3 = v2 content plus stable Concepts and application Question definitions.

import { parseSharePayload, type SharePayload } from './sharePayload';
import { buildCourseSharePayload } from './shareCoursePayload';
import { encodeShare, encodeShareQR } from './shareTransport';

export { parseSharePayload, V1_SHARE_CODE_MESSAGE } from './sharePayload';
export type { ShareLesson, SharePayload, SharePayloadV6 } from './sharePayload';
export { buildCourseSharePayload } from './shareCoursePayload';
export { applyImportedCourseScheduling, importSharePayload } from './shareCourseImport';
export type { ImportCourseScheduling } from './shareCourseImport';
export {
  decodeShare,
  decodeShareDirect,
  encodeShareDirect,
  encodeShareQRDirect,
} from './shareTransport';

/** A human-friendly summary of a share code, for the import preview. */
export interface ShareSummary {
  kind: 'deck' | 'course';
  deckCount: number;
  cardCount: number;
  exportedAt: number;
  deckNames: string[];
  omittedImages: boolean;
  /** Course payloads only: the course's name. */
  courseName?: string;
  /** Course payloads only: number of lessons. */
  lessonCount?: number;
  /** Course payloads only: number of notes across all lessons. */
  noteCount?: number;
  /** v3 only: number of application Questions. */
  questionCount?: number;
}

/** Count the cards a payload would create (reversible pairs count as two). */
export function summariseShare(input: SharePayload): ShareSummary {
  const payload = parseSharePayload(input);
  if (payload.v !== 6) throw new Error('Unsupported old share version.');
  {
    let cardCount = 0;
    let omittedImages = false;
    const lessonNames: string[] = [];
    for (const lesson of payload.lessons) {
      lessonNames.push(lesson.n);
      for (const card of lesson.cards) {
        cardCount += card.k === 2 ? 2 : 1;
        if (card.i === 1) omittedImages = true;
      }
      if (lesson.notes.some((n) => n.i === 1)) omittedImages = true;
    }
    for (const card of payload.bankCards ?? []) {
      cardCount += card.k === 2 ? 2 : 1;
      if (card.i === 1) omittedImages = true;
    }
    if (payload.questions.some((question) => question.k === 0 && question.i === 1)) {
      omittedImages = true;
    }
    return {
      kind: 'course',
      deckCount: payload.lessons.length,
      cardCount,
      exportedAt: payload.at,
      deckNames: lessonNames,
      omittedImages,
      courseName: payload.course.n,
      lessonCount: payload.lessons.length,
      noteCount: payload.lessons.reduce((count, lesson) => count + lesson.notes.length, 0),
      questionCount: payload.questions.length,
    };
  }
}

/** Build a share code for the given course. */
export async function buildCourseShareCode(courseId: string): Promise<string> {
  return encodeShare(await buildCourseSharePayload(courseId));
}

/** Build a QR-code-optimised share code for the given course. */
export async function buildCourseShareCodeQR(courseId: string): Promise<string> {
  return encodeShareQR(await buildCourseSharePayload(courseId));
}
