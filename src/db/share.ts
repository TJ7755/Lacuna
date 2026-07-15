// Deck/course sharing: turn one or more decks' content, or a whole course, into a
// single compact, copy-and-paste code, and rebuild it from such a code. A share code
// carries only the *content* needed to recreate the material (type, front, back, tags
// — images ride along inside the Markdown as base64 data URIs — plus, for a course,
// its lessons, notes and extra exam dates) alongside light scheduling metadata (name,
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
//   v1 = a flat list of decks (the original shape).
//   v2 = a single course: course metadata, ordered lessons (each with notes and
//        cards) and any extra exam dates. Deliberately out of scope for v2:
//        LessonCardLink (display-only linking) and PracticeNode (practice is a
//        later phase) — a shared course carries only the taught material.

import { z } from 'zod';
import { db, makeId } from './schema';
import {
  createCards,
  createCourse,
  ensureLessonDeck,
} from './repository';
import { clampRequestRetention, defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { emptyPerformance } from '../fsrs/grading';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import type { ParsedCard } from './import';
import type {
  Card,
  CourseExamDate,
  Deck,
  Folder,
  Lesson,
  Note,
  Sequence,
  SequenceItem,
  UnlockMode,
} from './types';
import { stripAssetImages } from './assets';
import { bytesToBase45, base45ToBytes } from './base45';
import { buildCourseMigration } from './courseMigration';
import { LABEL_CARD_SUFFIX } from './sequenceGeneration';

const PREFIX_BASE45_COMPRESSED = 'LAC2';
const PREFIX_BASE45_PLAIN = 'LAC3';
const PREFIX_COMPRESSED = 'LAC1';
const PREFIX_PLAIN = 'LAC0';

// ---------------------------------------------------------------------------
// Zod runtime schema for share payloads
// ---------------------------------------------------------------------------

const ShareCardSchema = z.object({
  k: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  f: z.string(),
  b: z.string().optional(),
  g: z.array(z.string()).optional(),
  i: z.literal(1).optional(),
  // Present iff this card was generated from a sequence item (positional or label,
  // the latter carrying the `::label` suffix, mirroring Card.sequenceItemId).
  si: z.string().optional(),
});

const ShareDeckSchema = z.object({
  n: z.string().min(1),
  o: z.union([z.literal(0), z.literal(1)]),
  c: z.number(),
  e: z.number(),
  r: z.number().optional(),
  p: z.number().optional(),
  l: z.string().optional(),
  cards: z.array(ShareCardSchema),
});

/** A single note in a v2 (course) share payload. */
const ShareNoteSchema = z.object({
  n: z.string(), // name
  c: z.string(), // content
  i: z.literal(1).optional(), // one or more images were replaced by a placeholder
});

/** A single lesson in a v2 (course) share payload. */
const ShareLessonSchema = z.object({
  n: z.string().min(1),
  d: z.string().optional(), // description
  x: z.union([z.literal(0), z.literal(1)]).optional(), // isExtension
  rd: z.number().optional(), // releaseDate
  ed: z.number().optional(), // examDate override
  tz: z.string().optional(), // timeZone (paired with rd/ed)
  notes: z.array(ShareNoteSchema),
  cards: z.array(ShareCardSchema),
});

/** Course metadata in a v2 share payload, mirroring ShareDeck's conventions. */
const ShareCourseSchema = z.object({
  n: z.string().min(1),
  d: z.string().optional(), // description
  o: z.union([z.literal(0), z.literal(1)]), // objective: 0 expectedMarks, 1 securedTopics
  c: z.number(), // createdAt
  e: z.number(), // examDate (primary date due)
  r: z.number().optional(), // requestRetention
  p: z.number().optional(), // newCardsPerDay
  l: z.string().optional(), // colour
  um: z.union([z.literal('linear'), z.literal('semi-linear'), z.literal('open')]),
});

/**
 * An extra CourseExamDate (beyond the course's primary exam date) in a v2 payload.
 * `excludedCardIds` is deliberately omitted: per-card checkpoint exclusions are a
 * lossy detail that does not survive a share round-trip.
 */
const ShareExamSchema = z.object({
  n: z.string(), // name
  e: z.number(), // examDate
  tz: z.string().optional(), // timeZone
  ls: z.array(z.number()).optional(), // indices into the payload's lessons array
});

/** A single SequenceItem in a v2 share payload. */
const ShareSequenceItemSchema = z.object({
  id: z.string(),
  v: z.string(), // value
  l: z.string().optional(), // label
  ci: z.number().optional(), // chunkIndex
});

/** A whole Sequence (items inline) in a v2 share payload. */
const ShareSequenceSchema = z.object({
  id: z.string(),
  n: z.string().min(1),
  d: z.string().optional(), // description
  items: z.array(ShareSequenceItemSchema),
  cw: z.number(), // cueWindow
  cl: z.array(z.string()).optional(), // chunkLabels
  lc: z.union([z.literal(0), z.literal(1)]).optional(), // generateLabelCards
  pl: z.number().optional(), // index into the payload's lessons array (primaryLessonId)
});

const SharePayloadV1Schema = z.object({
  v: z.literal(1),
  by: z.union([z.string(), z.null()]).optional(),
  at: z.number(),
  decks: z.array(ShareDeckSchema),
});

const SharePayloadV2Schema = z.object({
  v: z.literal(2),
  by: z.union([z.string(), z.null()]).optional(),
  at: z.number(),
  course: ShareCourseSchema,
  lessons: z.array(ShareLessonSchema),
  exams: z.array(ShareExamSchema).optional(),
  // Additive/optional so existing v2 codes without sequences still parse cleanly.
  sequences: z.array(ShareSequenceSchema).optional(),
});

const SharePayloadSchema = z.discriminatedUnion('v', [SharePayloadV1Schema, SharePayloadV2Schema]);

/** A single card in a share payload. `k` is the kind. */
interface ShareCard {
  /**
   * 0 = front/back, 1 = cloze, 2 = reversible front/back pair (expands to two
   * cards). 3 = typing — retired as a card type (see src/state/typingSetting.ts);
   * still decoded on import for backward compatibility with older share codes,
   * where it unpacks to a plain front_back card.
   */
  k: 0 | 1 | 2 | 3;
  /** Front (Markdown). For cloze this holds the whole `{{cN::…}}` source. */
  f: string;
  /** Back (Markdown). Absent for cloze. */
  b?: string;
  /** Tags, when any. */
  g?: string[];
  /** True when one or more images were replaced by a placeholder. */
  i?: 1;
  /** Present iff generated from a sequence item; mirrors Card.sequenceItemId. */
  si?: string;
}

/** A single deck in a v1 share payload, with compact keys. */
interface ShareDeck {
  n: string; // name
  o: 0 | 1; // objective: 0 expectedMarks, 1 securedTopics
  c: number; // createdAt (date created)
  e: number; // examDate (date due)
  r?: number; // requestRetention
  p?: number; // newCardsPerDay
  l?: string; // colour
  cards: ShareCard[];
}

/** A single note in a v2 share payload. */
interface ShareNote {
  n: string; // name
  c: string; // content
  i?: 1; // one or more images were replaced by a placeholder
}

/** A single lesson in a v2 share payload. */
interface ShareLesson {
  n: string; // name
  d?: string; // description
  x?: 0 | 1; // isExtension
  rd?: number; // releaseDate
  ed?: number; // examDate override
  tz?: string; // timeZone (paired with rd/ed)
  sf?: 'due' | 'mixed'; // sessionFilter ('new' is the default, so omitted)
  notes: ShareNote[];
  cards: ShareCard[];
}

/** Course metadata in a v2 share payload. */
interface ShareCourse {
  n: string; // name
  d?: string; // description
  o: 0 | 1; // objective: 0 expectedMarks, 1 securedTopics
  c: number; // createdAt
  e: number; // examDate (primary date due)
  r?: number; // requestRetention
  p?: number; // newCardsPerDay
  l?: string; // colour
  um: UnlockMode;
}

/** An extra CourseExamDate in a v2 share payload. */
interface ShareExam {
  n: string; // name
  e: number; // examDate
  tz?: string; // timeZone
  ls?: number[]; // indices into the payload's lessons array (scoped lessons)
}

/** A single SequenceItem in a v2 share payload. */
interface ShareSequenceItem {
  id: string;
  v: string; // value
  l?: string; // label
  ci?: number; // chunkIndex
}

/** A whole Sequence (items inline) in a v2 share payload. */
interface ShareSequence {
  id: string;
  n: string; // name
  d?: string; // description
  items: ShareSequenceItem[];
  cw: number; // cueWindow
  cl?: string[]; // chunkLabels
  lc?: 0 | 1; // generateLabelCards
  pl?: number; // index into the payload's lessons array (primaryLessonId)
}

/** The decoded contents of a v1 (flat deck list) share code. */
export interface SharePayloadV1 {
  v: 1;
  /** Creator, reserved for a future "shared by" field; currently always null. */
  by?: string | null;
  /** Exported-at epoch ms. */
  at: number;
  decks: ShareDeck[];
}

/** The decoded contents of a v2 (single course) share code. */
interface SharePayloadV2 {
  v: 2;
  /** Creator, reserved for a future "shared by" field; currently always null. */
  by?: string | null;
  /** Exported-at epoch ms. */
  at: number;
  course: ShareCourse;
  lessons: ShareLesson[];
  exams?: ShareExam[];
  /** Overlapping-cloze sequences belonging to the course. Optional so existing v2
   *  codes without sequences still parse. */
  sequences?: ShareSequence[];
}

/** The decoded contents of a share code, either a flat deck list or a single course. */
export type SharePayload = SharePayloadV1 | SharePayloadV2;

/** A human-friendly summary of a share code, for the import preview. */
export interface ShareSummary {
  kind: 'deck' | 'course';
  deckCount: number;
  cardCount: number;
  exportedAt: number;
  deckNames: string[];
  omittedImages: boolean;
  /** v2 only: the course's name. */
  courseName?: string;
  /** v2 only: number of lessons. */
  lessonCount?: number;
}

// ---------------------------------------------------------------------------
// Base64 and DEFLATE helpers (direct fallback when Worker is unavailable)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // chunk so very large images do not overflow the call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
  maxBytes?: number,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource);
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (maxBytes !== null && maxBytes !== undefined && total > maxBytes) {
        await reader.cancel();
        throw new Error('Share code is too large to decode safely.');
      }
      chunks.push(value);
    }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const canCompress = typeof CompressionStream !== 'undefined';
const canDecompress = typeof DecompressionStream !== 'undefined';

export async function encodeShareDirect(payload: SharePayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress) {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw'));
    return PREFIX_COMPRESSED + bytesToBase64(deflated);
  }
  return PREFIX_PLAIN + bytesToBase64(bytes);
}

/** Encode a share payload as a Base45 string optimised for QR code density. */
export async function encodeShareQR(payload: SharePayload): Promise<string> {
  if (canUseShareWorker) {
    try {
      return await runShareWorker<string>({ type: 'encodeQR', payload });
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress) {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw'));
    return PREFIX_BASE45_COMPRESSED + bytesToBase45(deflated);
  }
  return PREFIX_BASE45_PLAIN + bytesToBase45(bytes);
}

const MAX_SHARE_BYTES = 5 * 1024 * 1024;

export async function decodeShareDirect(code: string): Promise<SharePayload> {
  const trimmed = code.trim();
  let bytes: Uint8Array;

  if (trimmed.startsWith(PREFIX_BASE45_COMPRESSED)) {
    if (!canDecompress) {
      throw new Error('This browser cannot read compressed share codes.');
    }
    const encoded = trimmed.slice(PREFIX_BASE45_COMPRESSED.length);
    const compressed = base45ToBytes(encoded);
    if (compressed.length > MAX_SHARE_BYTES) {
      throw new Error('Share code is too large to decode safely.');
    }
    bytes = await pipeThrough(
      compressed,
      new DecompressionStream('deflate-raw'),
      MAX_SHARE_BYTES,
    );
  } else if (trimmed.startsWith(PREFIX_BASE45_PLAIN)) {
    const encoded = trimmed.slice(PREFIX_BASE45_PLAIN.length);
    bytes = base45ToBytes(encoded);
    if (bytes.length > MAX_SHARE_BYTES) {
      throw new Error('Share code is too large to decode safely.');
    }
  } else {
    // Legacy base64 formats (LAC0 / LAC1) — strip whitespace before decoding
    // because base64 never contains whitespace.
    const stripped = trimmed.replace(/\s+/g, '');
    if (stripped.startsWith(PREFIX_COMPRESSED)) {
      if (!canDecompress) {
        throw new Error('This browser cannot read compressed share codes.');
      }
      const compressed = base64ToBytes(stripped.slice(PREFIX_COMPRESSED.length));
      if (compressed.length > MAX_SHARE_BYTES) {
        throw new Error('Share code is too large to decode safely.');
      }
      bytes = await pipeThrough(
        compressed,
        new DecompressionStream('deflate-raw'),
        MAX_SHARE_BYTES,
      );
    } else if (stripped.startsWith(PREFIX_PLAIN)) {
      bytes = base64ToBytes(stripped.slice(PREFIX_PLAIN.length));
      if (bytes.length > MAX_SHARE_BYTES) {
        throw new Error('Share code is too large to decode safely.');
      }
    } else {
      throw new Error('That does not look like a Lacuna share code.');
    }
  }

  if (bytes.length > MAX_SHARE_BYTES) {
    throw new Error('Share code is too large to decode safely.');
  }

  let payload: SharePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
  } catch {
    throw new Error('The share code is corrupted and could not be read.');
  }
  const parse = SharePayloadSchema.safeParse(payload);
  if (!parse.success) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('Share payload validation failed:', parse.error.issues);
    }
    throw new Error('This share code is from an unsupported version of Lacuna.');
  }
  return parse.data;
}

// ---------------------------------------------------------------------------
// Worker offload for encode / decode
// ---------------------------------------------------------------------------

const canUseShareWorker = typeof Worker !== 'undefined';

let shareWorker: Worker | null = null;
let shareJobId = 0;

function getShareWorker(): Worker {
  if (!shareWorker) {
    shareWorker = new Worker(
      new URL('../workers/share.worker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return shareWorker;
}

function runShareWorker<T>(
  message:
    | { type: 'encode'; payload: SharePayload }
    | { type: 'encodeQR'; payload: SharePayload }
    | { type: 'decode'; code: string },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++shareJobId;
    const w = getShareWorker();
    const TIMEOUT_MS = 30000; // 30 seconds

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      w.removeEventListener('message', messageHandler);
      w.removeEventListener('error', errorHandler);
      w.removeEventListener('messageerror', messageErrorHandler);
    }

    const messageHandler = (event: MessageEvent) => {
      const data = event.data as {
        type: string;
        result?: T;
        error?: string;
        id?: number;
      };
      if (data.id !== id) return;
      cleanup();
      if (data.type === 'error') {
        reject(new Error(data.error ?? 'Share worker failed.'));
      } else {
        resolve(data.result as T);
      }
    };

    const errorHandler = (e: ErrorEvent) => {
      cleanup();
      // Clear the cached worker so the next call creates a fresh one.
      shareWorker = null;
      reject(new Error(`Share worker failed: ${e.message || 'unknown error'}`));
    };

    const messageErrorHandler = () => {
      cleanup();
      shareWorker = null;
      reject(new Error('Share worker received an invalid message.'));
    };

    w.addEventListener('message', messageHandler);
    w.addEventListener('error', errorHandler);
    w.addEventListener('messageerror', messageErrorHandler);
    w.postMessage({ ...message, id });

    // Set timeout to force cleanup if the worker hangs
    timeoutId = setTimeout(() => {
      cleanup();
      shareWorker = null;
      reject(new Error('Share worker timed out after 30 seconds.'));
    }, TIMEOUT_MS);
  });
}

async function encodeShare(payload: SharePayload): Promise<string> {
  if (canUseShareWorker) {
    try {
      return await runShareWorker<string>({ type: 'encode', payload });
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  return encodeShareDirect(payload);
}

/** Decode a share code into its payload, throwing a readable error if it is invalid. */
export async function decodeShare(code: string): Promise<SharePayload> {
  if (canUseShareWorker) {
    try {
      return await runShareWorker<SharePayload>({ type: 'decode', code });
    } catch {
      // Fall through to direct path if the worker fails.
    }
  }
  return decodeShareDirect(code);
}

/** Count the cards a payload would create (reversible pairs count as two). */
export function summariseShare(payload: SharePayload): ShareSummary {
  if (payload.v === 2) {
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
    return {
      kind: 'course',
      deckCount: payload.lessons.length,
      cardCount,
      exportedAt: payload.at,
      deckNames: lessonNames,
      omittedImages,
      courseName: payload.course.n,
      lessonCount: payload.lessons.length,
    };
  }

  let cardCount = 0;
  const deckNames: string[] = [];
  for (const deck of payload.decks) {
    deckNames.push(deck.n);
    for (const card of deck.cards) cardCount += card.k === 2 ? 2 : 1;
  }
  return {
    kind: 'deck',
    deckCount: payload.decks.length,
    cardCount,
    exportedAt: payload.at,
    deckNames,
    omittedImages: payload.decks.some((d) => d.cards.some((c) => c.i === 1)),
  };
}

// ---------------------------------------------------------------------------
// Packing (DB -> code)
// ---------------------------------------------------------------------------

/**
 * Pack a deck's cards, folding each front/back card that has an exact mirror into a
 * single reversible entry. Cloze cards pass through untouched.
 */
function packCards(cards: Card[]): ShareCard[] {
  const out: ShareCard[] = [];
  const consumed = new Set<string>();
  // Use a length-prefixed key so the separator can never collide with card content.
  // Format: length-of-front + \u0002 + front + \u0002 + back.  \u0002 is a control
  // character that cannot appear in normal Markdown.
  const key = (f: string, b: string) => `${f.length}${f}${b}`;

  // Index front/back cards by content so a card can find its mirror in one lookup.
  const byContent = new Map<string, Card[]>();
  for (const c of cards) {
    if (c.type !== 'front_back') continue;
    const k = key(c.front, c.back);
    const bucket = byContent.get(k);
    if (bucket) bucket.push(c);
    else byContent.set(k, [c]);
  }

  for (const c of cards) {
    if (consumed.has(c.id)) continue;
    const tags = c.tags && c.tags.length ? { g: c.tags } : {};
    const front = stripAssetImages(c.front);
    const back = stripAssetImages(c.back);
    const imageFlag = front.stripped || back.stripped ? { i: 1 as const } : {};
    const seqRef = c.sequenceItemId ? { si: c.sequenceItemId } : {};

    if (c.type === 'cloze') {
      out.push({ k: 1, f: front.markdown, ...tags, ...imageFlag, ...seqRef });
      consumed.add(c.id);
      continue;
    }

    if (c.sequenceItemId) {
      // Cards generated from a sequence item never fold into a reversible pair either —
      // the `si` reference must stay on exactly one, unambiguous card so it can be
      // remapped consistently on import.
      out.push({ k: 0, f: front.markdown, b: back.markdown, ...tags, ...imageFlag, ...seqRef });
      consumed.add(c.id);
      continue;
    }

    const partner = (byContent.get(key(c.back, c.front)) ?? []).find(
      (p) => p.id !== c.id && !consumed.has(p.id),
    );
    if (partner) {
      out.push({ k: 2, f: front.markdown, b: back.markdown, ...tags, ...imageFlag });
      consumed.add(c.id);
      consumed.add(partner.id);
    } else {
      out.push({ k: 0, f: front.markdown, b: back.markdown, ...tags, ...imageFlag });
      consumed.add(c.id);
    }
  }
  return out;
}

/** Pack the given decks into a share payload, preserving order. */
async function buildSharePayload(deckIds: string[]): Promise<SharePayload> {
  const found = await db.decks.where('id').anyOf(deckIds).toArray();
  const order = new Map(deckIds.map((id, i) => [id, i]));
  found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const decks: ShareDeck[] = [];
  for (const deck of found) {
    const cards = await db.cards.where('deckId').equals(deck.id).sortBy('createdAt');
    decks.push({
      n: deck.name,
      o: deck.examObjective === 'securedTopics' ? 1 : 0,
      c: deck.createdAt,
      e: deck.examDate,
      r: deck.fsrsParameters.requestRetention,
      ...(deck.newCardsPerDay ? { p: deck.newCardsPerDay } : {}),
      ...(deck.colour ? { l: deck.colour } : {}),
      cards: packCards(cards),
    });
  }

  return { v: 1, by: null, at: Date.now(), decks };
}

/** Build a single share code for the given decks, in the order supplied. */
export async function buildShareCode(deckIds: string[]): Promise<string> {
  return encodeShare(await buildSharePayload(deckIds));
}

// ---------------------------------------------------------------------------
// Unpacking (code -> DB)
// ---------------------------------------------------------------------------

function unpackCard(sc: ShareCard): ParsedCard[] {
  const tags = sc.g && sc.g.length ? { tags: sc.g } : {};
  if (sc.k === 1) return [{ type: 'cloze', front: sc.f, back: '', ...tags }];
  if (sc.k === 2) {
    const back = sc.b ?? '';
    return [
      { type: 'front_back', front: sc.f, back, ...tags },
      { type: 'front_back', front: back, back: sc.f, ...tags },
    ];
  }
  // k === 3 (typing) and k === 0 (front/back) both unpack to a plain front_back
  // card — typing is a retired card type, folded here for older share codes.
  return [{ type: 'front_back', front: sc.f, back: sc.b ?? '', ...tags }];
}

// ---------------------------------------------------------------------------
// Packing a whole course (DB -> v2 payload)
// ---------------------------------------------------------------------------

/** Pack a lesson's notes, stripping images the same way card content is stripped. */
function packNotes(notes: { name: string; content: string }[]): ShareNote[] {
  return notes.map((n) => {
    const content = stripAssetImages(n.content);
    return { n: n.name, c: content.markdown, ...(content.stripped ? { i: 1 as const } : {}) };
  });
}

/** Pack a whole course — its lessons, notes, cards and extra exam dates — into a v2 payload. */
async function buildCourseSharePayload(courseId: string): Promise<SharePayload> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('Course not found.');

  const lessons = await db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
  const lessonIndexById = new Map(lessons.map((l, i) => [l.id, i]));
  const lessonIds = lessons.map((lesson) => lesson.id);
  const [notes, cards] = await Promise.all([
    lessonIds.length > 0 ? db.notes.where('lessonId').anyOf(lessonIds).toArray() : [],
    lessonIds.length > 0
      ? db.cards.where('primaryLessonId').anyOf(lessonIds).toArray()
      : [],
  ]);
  const notesByLesson = new Map<string, Note[]>();
  for (const note of notes) {
    const group = notesByLesson.get(note.lessonId);
    if (group) group.push(note);
    else notesByLesson.set(note.lessonId, [note]);
  }
  const cardsByLesson = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.primaryLessonId) continue;
    const group = cardsByLesson.get(card.primaryLessonId);
    if (group) group.push(card);
    else cardsByLesson.set(card.primaryLessonId, [card]);
  }
  for (const group of notesByLesson.values()) group.sort((a, b) => a.orderIndex - b.orderIndex);
  for (const group of cardsByLesson.values()) group.sort((a, b) => a.createdAt - b.createdAt);

  const shareLessons: ShareLesson[] = lessons.map((lesson) => {
    return {
      n: lesson.name,
      ...(lesson.description ? { d: lesson.description } : {}),
      ...(lesson.isExtension ? { x: 1 as const } : {}),
      ...(typeof lesson.releaseDate === 'number' ? { rd: lesson.releaseDate } : {}),
      ...(typeof lesson.examDate === 'number' ? { ed: lesson.examDate } : {}),
      ...(lesson.timeZone ? { tz: lesson.timeZone } : {}),
      ...(lesson.sessionFilter && lesson.sessionFilter !== 'new' ? { sf: lesson.sessionFilter } : {}),
      notes: packNotes(notesByLesson.get(lesson.id) ?? []),
      cards: packCards(cardsByLesson.get(lesson.id) ?? []),
    };
  });

  const examDates = await db.courseExamDates.where('courseId').equals(courseId).sortBy('examDate');
  const shareExams: ShareExam[] = examDates.map((e) => {
    const ls = (e.lessonIds ?? [])
      .map((id) => lessonIndexById.get(id))
      .filter((i): i is number => i !== undefined);
    return {
      n: e.name,
      e: e.examDate,
      ...(e.timeZone ? { tz: e.timeZone } : {}),
      ...(e.lessonIds && e.lessonIds.length ? { ls } : {}),
    };
  });

  const shareCourse: ShareCourse = {
    n: course.name,
    ...(course.description ? { d: course.description } : {}),
    o: course.examObjective === 'securedTopics' ? 1 : 0,
    c: course.createdAt,
    e: course.examDate,
    r: course.fsrsParameters.requestRetention,
    ...(course.newCardsPerDay ? { p: course.newCardsPerDay } : {}),
    ...(course.colour ? { l: course.colour } : {}),
    um: course.unlockMode,
  };

  // Bank-scoped sequences (primaryLessonId null) have no packed cards — see the
  // per-lesson `cards` query above, which only covers lesson-scoped cards. Excluding
  // them here keeps the payload internally consistent, mirroring the exclusion of
  // bank cards from shares.
  const sequences = (await db.sequences.where('courseId').equals(courseId).sortBy('createdAt')).filter(
    (s) => s.primaryLessonId !== null
  );
  const shareSequences: ShareSequence[] = sequences.map((s) => {
    const pl = s.primaryLessonId ? lessonIndexById.get(s.primaryLessonId) : undefined;
    return {
      id: s.id,
      n: s.name,
      ...(s.description ? { d: s.description } : {}),
      items: s.items.map((item) => ({
        id: item.id,
        v: item.value,
        ...(item.label ? { l: item.label } : {}),
        ...(item.chunkIndex !== undefined ? { ci: item.chunkIndex } : {}),
      })),
      cw: s.cueWindow,
      ...(s.chunkLabels && s.chunkLabels.length ? { cl: s.chunkLabels } : {}),
      ...(s.generateLabelCards ? { lc: 1 as const } : {}),
      ...(pl !== undefined ? { pl } : {}),
    };
  });

  return {
    v: 2,
    by: null,
    at: Date.now(),
    course: shareCourse,
    lessons: shareLessons,
    ...(shareExams.length ? { exams: shareExams } : {}),
    ...(shareSequences.length ? { sequences: shareSequences } : {}),
  };
}

/** Build a single v2 share code for the given course. */
export async function buildCourseShareCode(courseId: string): Promise<string> {
  return encodeShare(await buildCourseSharePayload(courseId));
}

/** Build a QR-code-optimised v2 share code for the given course. */
export async function buildCourseShareCodeQR(courseId: string): Promise<string> {
  return encodeShareQR(await buildCourseSharePayload(courseId));
}

// ---------------------------------------------------------------------------
// Importing (code -> DB). Both v1 and v2 payloads land in the course model:
// a shared course dashboard only shows courses/lessons, so a v1 (deck) code is
// migrated on the fly via the same buildCourseMigration helper the schema
// upgrade uses.
// ---------------------------------------------------------------------------

/** The result of importing a share payload: everything created. */
export interface ImportShareResult {
  courses: number;
  lessons: number;
  cards: number;
}

/**
 * Import a v1 (flat deck list) payload. Real decks are still created — course
 * cards need a backing deck for recordReview/userPerformance/the learn-mode
 * bridge — but they are also folded into a course via buildCourseMigration so
 * the imported content is visible on the course dashboard: a single shared deck
 * becomes a single-lesson course; several decks in one payload are treated as
 * one course with one ordered lesson per deck (mirroring how a folder migrates).
 */
async function importDeckSharePayload(payload: SharePayloadV1): Promise<ImportShareResult> {
  const now = Date.now();
  const decks: Deck[] = payload.decks.map((d, i) => ({
    id: makeId(),
    name: d.n || 'Shared deck',
    examDate: typeof d.e === 'number' && d.e > 0 ? d.e : defaultExamDate(now),
    timeZone: getLocalTimeZone(),
    createdAt: now + i,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: {
      ...defaultFsrsParameters(),
      ...(typeof d.r === 'number' ? { requestRetention: clampRequestRetention(d.r) } : {}),
    },
    examObjective: d.o === 1 ? 'securedTopics' : 'expectedMarks',
    ...(d.p && d.p > 0 ? { newCardsPerDay: d.p } : {}),
    ...(d.l ? { colour: d.l } : {}),
  }));

  // Several decks in one payload were shared together (e.g. from a folder); give
  // them a synthetic folder so buildCourseMigration folds them into one course
  // with one lesson per deck, rather than N separate courses.
  const folders: Folder[] = [];
  if (decks.length > 1) {
    const folder: Folder = { id: makeId(), name: 'Shared course', parentId: null, createdAt: now };
    folders.push(folder);
    for (const deck of decks) deck.folderId = folder.id;
  }

  const migration = buildCourseMigration(decks, folders, makeId);
  let cardCount = 0;

  await db.transaction(
    'rw',
    [db.decks, db.cards, db.userPerformance, db.assets, db.courses, db.lessons],
    async () => {
      for (let i = 0; i < decks.length; i++) {
        const deck = decks[i];
        const drafts = payload.decks[i].cards.flatMap(unpackCard);
        await db.decks.add(deck);
        await db.userPerformance.add(emptyPerformance(deck.id));
        const cards = drafts.length > 0 ? await createCards(deck.id, drafts) : [];
        const courseId = migration.courseIdByDeckId.get(deck.id);
        const lessonId = migration.lessonIdByDeckId.get(deck.id);
        if (courseId && lessonId && cards.length > 0) {
          await db.cards
            .where('id')
            .anyOf(cards.map((c) => c.id))
            .modify({ courseId, primaryLessonId: lessonId });
        }
        cardCount += cards.length;
      }
      await db.courses.bulkAdd(migration.courses);
      await db.lessons.bulkAdd(migration.lessons);
    },
  );

  return { courses: migration.courses.length, lessons: migration.lessons.length, cards: cardCount };
}

/** Split a sequenceItemId into its base item id and, when present, the label-card suffix. */
function splitSequenceItemId(si: string): { baseId: string; isLabel: boolean } {
  if (si.endsWith(LABEL_CARD_SUFFIX)) {
    return { baseId: si.slice(0, -LABEL_CARD_SUFFIX.length), isLabel: true };
  }
  return { baseId: si, isLabel: false };
}

/** Import a v2 (single course) payload directly into the course model. */
async function importCourseSharePayload(payload: SharePayloadV2): Promise<ImportShareResult> {
  let cardCount = 0;

  await db.transaction(
    'rw',
    [
      db.courses,
      db.lessons,
      db.notes,
      db.decks,
      db.cards,
      db.userPerformance,
      db.assets,
      db.courseExamDates,
      db.sequences,
    ],
    async () => {
      // Pre-compute fresh ids for every incoming sequence and sequence item before any
      // lesson card is created, so a shared card's `si` reference (which is set while
      // walking `shareLesson.cards` below) can be remapped to the new item id straight
      // away. The sequence rows themselves are only inserted once every lesson (hence
      // lessonIds, needed for `primaryLessonId`) exists — see the loop after exams.
      const itemIdMap = new Map<string, string>();
      for (const shareSeq of payload.sequences ?? []) {
        for (const item of shareSeq.items) itemIdMap.set(item.id, makeId());
      }
      const remapSequenceItemId = (si: string): string | undefined => {
        const { baseId, isLabel } = splitSequenceItemId(si);
        const mapped = itemIdMap.get(baseId);
        if (!mapped) return undefined;
        return isLabel ? `${mapped}${LABEL_CARD_SUFFIX}` : mapped;
      };

      const course = await createCourse(payload.course.n || 'Shared course', {
        description: payload.course.d ?? '',
        examObjective: payload.course.o === 1 ? 'securedTopics' : 'expectedMarks',
        createdAt: payload.course.c,
        examDate: payload.course.e,
        fsrsParameters: {
          ...defaultFsrsParameters(),
          ...(typeof payload.course.r === 'number'
            ? { requestRetention: clampRequestRetention(payload.course.r) }
            : {}),
        },
        ...(payload.course.p && payload.course.p > 0 ? { newCardsPerDay: payload.course.p } : {}),
        ...(payload.course.l ? { colour: payload.course.l } : {}),
        unlockMode: payload.course.um,
        // Imported courses default to study (read-only) mode regardless of the
        // sharer's own setting — the share payload never packs lessonViewMode.
        lessonViewMode: 'study',
      });

      const importedAt = Date.now();
      const importedLessons: Lesson[] = payload.lessons.map((shareLesson, orderIndex) => ({
          id: makeId(),
          courseId: course.id,
          name: shareLesson.n.trim() || 'Untitled lesson',
          orderIndex,
          createdAt: importedAt + orderIndex,
          ...(shareLesson.d ? { description: shareLesson.d } : {}),
          isExtension: shareLesson.x === 1,
          ...(typeof shareLesson.rd === 'number' ? { releaseDate: shareLesson.rd } : {}),
          ...(typeof shareLesson.ed === 'number' ? { examDate: shareLesson.ed } : {}),
          ...(shareLesson.tz ? { timeZone: shareLesson.tz } : {}),
          ...(shareLesson.sf ? { sessionFilter: shareLesson.sf } : {}),
        }));
      if (importedLessons.length > 0) await db.lessons.bulkAdd(importedLessons);
      const lessonIds = importedLessons.map((lesson) => lesson.id);

      const importedNotes: Note[] = payload.lessons.flatMap((shareLesson, lessonIndex) =>
        shareLesson.notes.map((shareNote, orderIndex) => ({
          id: makeId(),
          lessonId: lessonIds[lessonIndex],
          name: shareNote.n.trim() || 'Untitled note',
          content: shareNote.c,
          orderIndex,
          createdAt: importedAt + orderIndex,
        })),
      );
      if (importedNotes.length > 0) await db.notes.bulkAdd(importedNotes);

      for (let lessonIndex = 0; lessonIndex < payload.lessons.length; lessonIndex++) {
        const shareLesson = payload.lessons[lessonIndex];
        const lessonId = lessonIds[lessonIndex];
        const drafts = shareLesson.cards.flatMap((shareCard) =>
          unpackCard(shareCard).map((draft) => ({ draft, sequenceItemId: shareCard.si })),
        );
        if (drafts.length === 0) continue;
        const deckId = await ensureLessonDeck(course.id, lessonId);
        const created = await createCards(
          deckId,
          drafts.map(({ draft }) => draft),
          { courseId: course.id, primaryLessonId: lessonId },
        );
        const generatedCards = created.flatMap((card, index) => {
          const sequenceItemId = drafts[index].sequenceItemId;
          if (!sequenceItemId) return [];
          const remapped = remapSequenceItemId(sequenceItemId);
          return remapped ? [{ ...card, sequenceItemId: remapped }] : [];
        });
        if (generatedCards.length > 0) await db.cards.bulkPut(generatedCards);
        cardCount += created.length;
      }

      const importedExams: CourseExamDate[] = (payload.exams ?? []).map(
        (shareExam, index) => ({
          id: makeId(),
          courseId: course.id,
          name: shareExam.n || 'Exam',
          examDate: shareExam.e,
          createdAt: importedAt + index,
          ...(shareExam.tz ? { timeZone: shareExam.tz } : {}),
          ...(shareExam.ls && shareExam.ls.length
            ? { lessonIds: shareExam.ls.map((i) => lessonIds[i]).filter((id): id is string => !!id) }
            : {}),
        }),
      );
      if (importedExams.length > 0) await db.courseExamDates.bulkAdd(importedExams);

      // Insert the sequences themselves once lessonIds is complete (for primaryLessonId)
      // and their generated cards already exist with remapped sequenceItemIds. Inserted
      // directly rather than via createSequence, which would generate a duplicate set of
      // cards — the shared cards already carry the sequence's generated content.
      const importedSequences: Sequence[] = (payload.sequences ?? []).map((shareSeq, index) => {
        const items: SequenceItem[] = shareSeq.items.map((item) => ({
          id: itemIdMap.get(item.id)!,
          value: item.v,
          ...(item.l ? { label: item.l } : {}),
          ...(item.ci !== undefined ? { chunkIndex: item.ci } : {}),
        }));
        const primaryLessonId =
          typeof shareSeq.pl === 'number' ? (lessonIds[shareSeq.pl] ?? null) : null;
        return {
          id: makeId(),
          courseId: course.id,
          primaryLessonId,
          name: shareSeq.n || 'Shared sequence',
          ...(shareSeq.d ? { description: shareSeq.d } : {}),
          items,
          cueWindow: shareSeq.cw,
          ...(shareSeq.cl && shareSeq.cl.length ? { chunkLabels: shareSeq.cl } : {}),
          ...(shareSeq.lc === 1 ? { generateLabelCards: true } : {}),
          createdAt: importedAt + index,
        };
      });
      if (importedSequences.length > 0) await db.sequences.bulkAdd(importedSequences);
    },
  );

  return { courses: 1, lessons: payload.lessons.length, cards: cardCount };
}

/**
 * Import a decoded share payload into the course model. Imported content is always
 * new (sharing never overwrites existing data); a v1 deck payload is migrated into
 * a course on the fly, and a v2 payload recreates its course directly. All FSRS/
 * review state starts clean for the new owner.
 */
export async function importSharePayload(payload: SharePayload): Promise<ImportShareResult> {
  if (payload.v === 2) return importCourseSharePayload(payload);
  return importDeckSharePayload(payload);
}
