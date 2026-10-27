import { z } from 'zod';
import {
  specificationAssessmentPointIds,
  validatePaperAssessmentDates,
} from '../specifications/assessment';
import { assertShareLessonPrerequisites } from './lessonPrerequisites';
import { parseQuestionSetPracticeNode } from './questionSetPracticeNode';
import { CURRENT_ITEM_PAYLOAD_VERSION } from './types';
import type { ItemPayload, QuestionSetPracticeNode, UnlockMode } from './types';
import type { QuestionPayload } from '../questions/types';
import { itemPayloadIsValid } from '../items/payloadValidation';
import { parseQuestionSetRecord, type QuestionSetRecord } from '../questions/questionSetCodec';
import {
  specificationPointIdsSchema,
  specificationRefSchema,
  specificationDataSchema,
  specificationCoverageFields,
  validSpecificationCoverageSelector,
} from '../specifications/linkSchemas';
import { assertCourseSpecificationSelection } from '../specifications/data';
import type { Specification } from '../specifications/catalogue';
import type { SpecificationReference } from '../specifications/links';

// ---------------------------------------------------------------------------
// Zod runtime schema for share payloads
// ---------------------------------------------------------------------------

const ItemFixtureSchema = z
  .object({
    id: z.string(),
    studentAnswer: z.union([z.string(), z.array(z.string()).min(1)]),
    expectedMarks: z.number().int().nonnegative(),
    note: z.string().optional(),
  })
  .passthrough();

const NumericAnswerSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), value: z.string() }).passthrough(),
  z.object({ kind: z.literal('within'), value: z.string(), tolerance: z.number() }).passthrough(),
  z.object({ kind: z.literal('matches-one-of'), values: z.array(z.string()) }).passthrough(),
]);

const MarkSchemeLineSchema = z.discriminatedUnion('kind', [
  z
    .object({
      marks: z.number(),
      label: z.string().optional(),
      kind: z.literal('waypoint'),
      expression: z.string(),
    })
    .passthrough(),
  z
    .object({
      marks: z.number(),
      label: z.string().optional(),
      kind: z.literal('predicate'),
      predicate: z.union([
        z.literal('equals'),
        z.literal('within'),
        z.literal('matches-one-of'),
        z.literal('contains'),
      ]),
      args: z.array(z.string()).optional(),
    })
    .passthrough(),
]);

const KnownItemPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      v: z.literal(CURRENT_ITEM_PAYLOAD_VERSION),
      kind: z.literal('numeric'),
      answer: NumericAnswerSpecSchema,
      fixtures: z.array(ItemFixtureSchema).optional(),
    })
    .passthrough(),
  z
    .object({
      v: z.literal(CURRENT_ITEM_PAYLOAD_VERSION),
      kind: z.literal('working'),
      scheme: z.array(MarkSchemeLineSchema).min(1),
      fixtures: z.array(ItemFixtureSchema).optional(),
    })
    .passthrough(),
  z
    .object({ v: z.literal(CURRENT_ITEM_PAYLOAD_VERSION), kind: z.literal('scaffold') })
    .passthrough(),
]);

const ShareQuestionPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      v: z.literal(CURRENT_ITEM_PAYLOAD_VERSION),
      kind: z.literal('numeric'),
      answer: NumericAnswerSpecSchema,
      fixtures: z.array(ItemFixtureSchema).optional(),
    })
    .passthrough(),
  z
    .object({
      v: z.literal(CURRENT_ITEM_PAYLOAD_VERSION),
      kind: z.literal('working'),
      scheme: z.array(MarkSchemeLineSchema).min(1),
      fixtures: z.array(ItemFixtureSchema).optional(),
    })
    .passthrough(),
]);

const KNOWN_ITEM_KINDS = new Set(['numeric', 'working', 'scaffold']);
const UnknownItemPayloadSchema = z
  .object({ v: z.number(), kind: z.string() })
  .passthrough()
  .refine(
    (payload) => payload.v !== CURRENT_ITEM_PAYLOAD_VERSION || !KNOWN_ITEM_KINDS.has(payload.kind),
    'Known item payloads must match their supported schema.',
  );

const ShareItemPayloadSchema = z
  .union([KnownItemPayloadSchema, UnknownItemPayloadSchema])
  .refine(itemPayloadIsValid, 'Structured item payload content is invalid.');

const ShareCardSchema = z
  .object({
    // Payload-scoped identity used to resolve `links`/exam `x` references within the
    // same code; always remapped via makeId() on import, never adopted as-is. For a
    // published (distributed) course this doubles as the originating card id lineage
    // merges (Arc 7 Task 5) key off — no separate field needed since `id` is already
    // packed for every course export.
    id: z.string().optional(),
    k: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    f: z.string(),
    b: z.string().optional(),
    g: z.array(z.string()).optional(),
    i: z.literal(1).optional(),
    // Present iff this card was generated from a sequence item (positional or label,
    // the latter carrying the `::label` suffix, mirroring Card.sequenceItemId).
    si: z.string().optional(),
    // Present iff this card was generated from an occlusion region, mirroring
    // Card.occlusionRegionId. Payload-scoped, remapped on import like `si`.
    oc: z.string().optional(),
    // Structured Arc 11 item content. Known payloads are validated fully; unknown
    // versions/kinds remain opaque so a newer item can use the read-only fallback.
    p: ShareItemPayloadSchema.optional(),
    // Stable Concept identity within a v3 payload. Optional only for v2 compatibility.
    co: z.string().optional(),
    am: z.enum(['reveal', 'type']).optional(),
  })
  .superRefine((card, context) => {
    if (card.p !== undefined && card.k !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Structured item payloads must be carried by front/back cards.',
        path: ['p'],
      });
    }
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
  // Originating note id, present only when the exporting course has been published
  // (`li` set at the payload level) — `i` is already taken by the image-omission
  // flag above, hence `oi` ("originating id") rather than the `i` shorthand used
  // for lessons below, where no such collision exists.
  oi: z.string().optional(),
});

/** A single lesson in a v2 (course) share payload. */
const ShareLessonSchema = z.object({
  pr: z.array(z.string().min(1)).optional(),
  am: z.enum(['reveal', 'type']).optional(),
  n: z.string().min(1),
  d: z.string().optional(), // description
  x: z.union([z.literal(0), z.literal(1)]).optional(), // isExtension
  rd: z.number().optional(), // releaseDate
  ed: z.number().optional(), // examDate override
  tz: z.string().optional(), // timeZone (paired with rd/ed)
  sf: z.union([z.literal('due'), z.literal('mixed')]).optional(), // sessionFilter ('new' is the default, so omitted)
  notes: z.array(ShareNoteSchema),
  cards: z.array(ShareCardSchema),
  // Payload-scoped Lesson identity, also present for ordinary prerequisite/Question Set links.
  i: z.string().optional(),
});

/** Course metadata in a v2 share payload, mirroring ShareDeck's conventions. */
const ShareCourseSchema = z
  .object({
    n: z.string().min(1),
    d: z.string().optional(), // description
    specificationRef: specificationRefSchema.optional(),
    specificationData: specificationDataSchema.optional(),
    examBoard: z.string().optional(),
    specification: z.string().optional(),
    o: z.union([z.literal(0), z.literal(1)]), // objective: 0 expectedMarks, 1 securedTopics
    c: z.number(), // createdAt
    e: z.number().optional(), // examDate (primary date due)
    sm: z.literal(1).optional(), // steady retention; absent means exam-targeted
    r: z.number().optional(), // requestRetention
    p: z.number().optional(), // newCardsPerDay
    lf: z.literal(0).optional(), // skip lesson introductions; absent means learn first
    l: z.string().optional(), // colour
    um: z.union([z.literal('linear'), z.literal('semi-linear'), z.literal('open')]),
  })
  .superRefine((course, context) => {
    try {
      assertCourseSpecificationSelection(course.specificationData, course.specificationRef);
    } catch (error) {
      context.addIssue({ code: 'custom', message: (error as Error).message });
    }
    if (course.sm === 1 && course.e !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Steady retention cannot include an exam date.',
      });
    } else if (course.sm !== 1 && course.e === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An exam-targeted course requires an exam date.',
      });
    }
  });

const ShareExamSchema = z
  .object({
    id: z.string().optional(),
    n: z.string(), // name
    e: z.number().optional(), // examDate
    sm: z.literal(1).optional(), // steady retention; valid only for the final assessment
    tz: z.string().optional(), // timeZone
    ls: z.array(z.number()).optional(), // indices into the payload's lessons array
    k: z.union([z.literal('f'), z.literal('c')]).optional(),
    a: z.number().nullable().optional(),
    m: z.union([z.literal('p'), z.literal('c'), z.literal('s')]).optional(),
    ...specificationCoverageFields,
    x: z.array(z.string()).optional(),
    ac: z.literal(1).optional(),
    c: z.number().optional(),
  })
  .superRefine((assessment, context) => {
    if (
      assessment.m === 's'
        ? !validSpecificationCoverageSelector(assessment) || assessment.ls !== undefined
        : assessment.specificationPaperId !== undefined ||
          assessment.specificationPointIds !== undefined
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid specification assessment coverage.' });
    }
    if (assessment.sm === 1) {
      if (assessment.k !== 'f') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only a final assessment can use steady retention.',
        });
      }
      if (assessment.e !== undefined || assessment.tz !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Steady retention cannot include an exam date or time zone.',
        });
      }
    } else if (assessment.e === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A dated assessment requires an exam date.',
      });
    }
  });

/** A single SequenceItem in a v2 share payload. */
const ShareSequenceItemSchema = z.object({
  id: z.string(),
  v: z.string(), // value
  l: z.string().optional(), // label
  ci: z.number().optional(), // chunkIndex
  sp: z.string().optional(), // speaker (lines mode)
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
  m: z.literal('lines').optional(), // mode ('list' is the default, so omitted)
  ms: z.string().optional(), // mySpeaker (lines mode)
  rc: z.number().int().min(2).max(8).optional(), // recitationChunkSize (lines mode)
  // presetId (sequencePresets.ts), only present when it can't be re-inferred from m/ms
  // alone (see presetForSequence) — e.g. distinguishing poetry from speech, or
  // procedure/timeline from a plain list.
  pr: z.string().optional(),
});

/** A single OcclusionRegion in a v2 share payload. Coordinates are fractions of the
 *  image, so they travel unchanged. `shape` is not packed: v1 is rectangles only and
 *  the import side restores the explicit value. */
const ShareOcclusionRegionSchema = z.object({
  id: z.string(),
  r: z.union([z.literal(0), z.literal(1)]), // role: 0 label, 1 feature
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  a: z.string().optional(), // answerText
  p: z.string().optional(), // pairedRegionId (payload-scoped; remapped on import)
  bn: z.string().optional(), // backNote
});

/** A whole Occlusion (regions inline). Text codes omit its diagram; course files
 * carry the referenced asset alongside this payload. */
const ShareOcclusionSchema = z.object({
  id: z.string(),
  regionConceptIds: z.record(z.string().min(1), z.string().min(1)).optional(),
  n: z.string().min(1),
  ah: z.string(), // assetHash
  regions: z.array(ShareOcclusionRegionSchema),
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
  bankCards: z.array(ShareCardSchema).optional(),
  links: z.array(z.object({ l: z.number(), c: z.string() })).optional(),
  // Additive/optional so existing v2 codes without sequences still parse cleanly.
  sequences: z.array(ShareSequenceSchema).optional(),
  // Likewise additive: codes predating image occlusion carry no `occlusions` array.
  occlusions: z.array(ShareOcclusionSchema).optional(),
  // Present iff the exporting course has published at least once (Course.distribution,
  // Arc 7 Task 1). `rv` is only ever present alongside `li`.
  li: z.string().optional(), // lineageId
  rv: z.number().optional(), // revision
});

const ShareConceptSchema = z.object({
  id: z.string().min(1),
  n: z.string().min(1),
  p: z.literal(1).optional(),
  specificationPointIds: specificationPointIdsSchema.optional(),
});

const ShareFixedQuestionSchema = z.object({
  id: z.string().min(1),
  k: z.literal(0),
  n: z.string().min(1),
  pl: z.number().int().nonnegative().optional(),
  al: z.array(z.number().int().nonnegative()).optional(),
  g: z.array(z.string()).optional(),
  s: z.literal(1).optional(),
  t: z.string().min(1),
  pr: z.array(z.string()),
  f: z.string().min(1),
  p: ShareQuestionPayloadSchema,
  e: z.string().min(1),
  ld: z.literal(1).optional(),
  i: z.literal(1).optional(),
});

const ShareGeneratedQuestionSchema = z.object({
  id: z.string().min(1),
  k: z.literal(1),
  n: z.string().min(1),
  pl: z.number().int().nonnegative().optional(),
  al: z.array(z.number().int().nonnegative()).optional(),
  g: z.array(z.string()).optional(),
  s: z.literal(1).optional(),
  t: z.string().min(1),
  pr: z.array(z.string()),
  gk: z.string().min(1),
  gv: z.number().int().positive(),
  gc: z.unknown(),
});

const ShareQuestionSchema = z.discriminatedUnion('k', [
  ShareFixedQuestionSchema,
  ShareGeneratedQuestionSchema,
]);

const SharePayloadV3Schema = SharePayloadV2Schema.omit({ v: true }).extend({
  v: z.literal(3),
  concepts: z.array(ShareConceptSchema),
  questions: z.array(ShareQuestionSchema),
});

const SharePayloadV4Schema = SharePayloadV3Schema.omit({ v: true }).extend({
  v: z.literal(4),
  questionSets: z.array(z.unknown()),
});

const SharePayloadV5Schema = SharePayloadV4Schema.omit({ v: true }).extend({
  v: z.literal(5),
  questionSetPracticeNodes: z.array(z.unknown()),
});

const SharePayloadV6Schema = SharePayloadV5Schema.extend({ v: z.literal(6) });

const SharePayloadSchema = z.discriminatedUnion('v', [
  SharePayloadV1Schema,
  SharePayloadV2Schema,
  SharePayloadV3Schema,
  SharePayloadV4Schema,
  SharePayloadV5Schema,
  SharePayloadV6Schema,
]);

/** A single card in a share payload. `k` is the kind. */
export interface ShareCard {
  am?: 'reveal' | 'type';
  id?: string;
  /**
   * 0 = front/back, 1 = cloze, 2 = reversible front/back pair (expands to two
   * cards). 3 = typing — retired as a card type (see src/state/answerInput.ts);
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
  /** Present iff generated from an occlusion region; mirrors Card.occlusionRegionId. */
  oc?: string;
  /** Structured item content; unknown variants travel opaquely for forward compatibility. */
  p?: ItemPayload | { v: number; kind: string; [key: string]: unknown };
  /** Payload-scoped Concept id in v3. */
  co?: string;
}

/** A single deck in a v1 share payload, with compact keys. */
interface ShareDeck {
  n: string; // name
  o: 0 | 1; // objective: 0 expectedMarks, 1 securedTopics
  c: number; // createdAt (date created)
  e: number; // examDate (date due)
  r?: number; // requestRetention
  p?: number; // newCardsPerDay
  lf?: 0; // skip lesson introductions; absent means learn first
  l?: string; // colour
  cards: ShareCard[];
}

/** A single note in a v2 share payload. */
export interface ShareNote {
  n: string; // name
  c: string; // content
  i?: 1; // one or more images were replaced by a placeholder
  oi?: string; // originating note id, present only when the course has been published
}

/** A single lesson in a v2 share payload. */
export interface ShareLesson {
  /** Advisory prerequisites by payload-scoped Lesson i, never array position. */
  pr?: string[];
  am?: 'reveal' | 'type';
  n: string; // name
  d?: string; // description
  x?: 0 | 1; // isExtension
  rd?: number; // releaseDate
  ed?: number; // examDate override
  tz?: string; // timeZone (paired with rd/ed)
  sf?: 'due' | 'mixed'; // sessionFilter ('new' is the default, so omitted)
  notes: ShareNote[];
  cards: ShareCard[];
  i?: string; // payload-scoped Lesson identity; lineage imports adopt it
}

/** Course metadata in a v2 share payload. */
export interface ShareCourse {
  n: string; // name
  d?: string; // description
  specificationRef?: SpecificationReference;
  specificationData?: Specification;
  examBoard?: string;
  specification?: string;
  o: 0 | 1; // objective: 0 expectedMarks, 1 securedTopics
  c: number; // createdAt
  e?: number; // examDate (primary date due)
  sm?: 1; // steady retention; absent means exam-targeted
  r?: number; // requestRetention
  p?: number; // newCardsPerDay
  lf?: 0; // skip lesson introductions; absent means learn first
  l?: string; // colour
  um: UnlockMode;
}

/** An assessment in a course share payload. Fields beyond n/e/tz/ls are additive to legacy v2. */
export interface ShareExam {
  id?: string;
  n: string; // name
  e?: number; // examDate
  sm?: 1; // steady retention; final assessment only
  tz?: string; // timeZone
  ls?: number[]; // indices into the payload's lessons array (scoped lessons)
  k?: 'f' | 'c';
  a?: number | null;
  m?: 'p' | 'c' | 's';
  specificationPaperId?: string;
  specificationPointIds?: string[];
  x?: string[];
  ac?: 1;
  c?: number;
}

/** A single SequenceItem in a v2 share payload. */
interface ShareSequenceItem {
  id: string;
  v: string; // value
  l?: string; // label
  ci?: number; // chunkIndex
  sp?: string; // speaker (lines mode)
}

/** A whole Sequence (items inline) in a v2 share payload. */
export interface ShareSequence {
  id: string;
  n: string; // name
  d?: string; // description
  items: ShareSequenceItem[];
  cw: number; // cueWindow
  cl?: string[]; // chunkLabels
  lc?: 0 | 1; // generateLabelCards
  pl?: number; // index into the payload's lessons array (primaryLessonId)
  m?: 'lines'; // mode ('list' is the default, so omitted)
  ms?: string; // mySpeaker (lines mode)
  rc?: number; // recitationChunkSize (lines mode)
  pr?: string; // presetId, only when it diverges from what m/ms alone would infer
}

/** A single OcclusionRegion in a v2 share payload. */
interface ShareOcclusionRegion {
  id: string;
  r: 0 | 1; // role: 0 label, 1 feature
  x: number;
  y: number;
  w: number;
  h: number;
  a?: string; // answerText
  p?: string; // pairedRegionId (payload-scoped; remapped on import)
  bn?: string; // backNote
}

/** A whole Occlusion (regions inline) in a v2 share payload. */
export interface ShareOcclusion {
  id: string;
  n: string; // name
  ah: string; // assetHash; course files carry the referenced asset separately
  regions: ShareOcclusionRegion[];
  regionConceptIds?: Record<string, string>;
  pl?: number; // index into the payload's lessons array (primaryLessonId)
}

/** The decoded contents of a v1 (flat deck list) share code. */
export interface SharePayloadV1 {
  v: 1;
  /** Literal creator/project display label; not verified authorship or approval. */
  by?: string | null;
  /** Exported-at epoch ms. */
  at: number;
  decks: ShareDeck[];
}

/** The decoded contents of a v2 (single course) share code. */
export interface SharePayloadV2 {
  v: 2;
  /** Literal creator/project display label; not verified authorship or approval. */
  by?: string | null;
  /** Exported-at epoch ms. */
  at: number;
  course: ShareCourse;
  lessons: ShareLesson[];
  exams?: ShareExam[];
  bankCards?: ShareCard[];
  links?: Array<{ l: number; c: string }>;
  /** Overlapping-cloze sequences belonging to the course. Optional so existing v2
   *  codes without sequences still parse. */
  sequences?: ShareSequence[];
  /** Image occlusions belonging to the course. Optional so existing v2 codes without
   *  occlusions still parse. */
  occlusions?: ShareOcclusion[];
  /** Lineage id, present iff the exporting course has published at least once
   *  (mirrors Course.distribution.lineageId, Arc 7). */
  li?: string;
  /** Revision number, present iff `li` is present (Course.distribution.revision). */
  rv?: number;
}

interface ShareConcept {
  id: string;
  n: string;
  p?: 1;
  specificationPointIds?: string[];
}

export type ShareQuestion =
  | {
      id: string;
      k: 0;
      n: string;
      pl?: number;
      al?: number[];
      g?: string[];
      s?: 1;
      t: string;
      pr: string[];
      f: string;
      p: QuestionPayload;
      e: string;
      ld?: 1;
      i?: 1;
    }
  | {
      id: string;
      k: 1;
      n: string;
      pl?: number;
      al?: number[];
      g?: string[];
      s?: 1;
      t: string;
      pr: string[];
      gk: string;
      gv: number;
      gc: unknown;
    };

export interface SharePayloadV3 extends Omit<SharePayloadV2, 'v'> {
  v: 3;
  concepts: ShareConcept[];
  questions: ShareQuestion[];
}

export interface SharePayloadV4 extends Omit<SharePayloadV3, 'v'> {
  v: 4;
  questionSets: QuestionSetRecord[];
}

export interface SharePayloadV5 extends Omit<SharePayloadV4, 'v'> {
  v: 5;
  questionSetPracticeNodes: QuestionSetPracticeNode[];
}

export interface SharePayloadV6 extends Omit<SharePayloadV5, 'v'> {
  v: 6;
}

/** The decoded contents of a share code, either a flat deck list or a single course. */
export type SharePayload =
  | SharePayloadV1
  | SharePayloadV2
  | SharePayloadV3
  | SharePayloadV4
  | SharePayloadV5
  | SharePayloadV6;

export const V1_SHARE_CODE_MESSAGE =
  'This share code is a v1 deck share code and can no longer be imported.';

export function assertShareSpecificationAssessments(
  payload: Exclude<SharePayload, SharePayloadV1>,
): void {
  const assessments = (payload.exams ?? []).map((exam) => ({
    coverageMode: exam.m === 's' ? ('specification' as const) : ('prefix' as const),
    specificationPaperId: exam.specificationPaperId,
    specificationPointIds: exam.specificationPointIds,
    kind: exam.k === 'f' ? ('final' as const) : ('checkpoint' as const),
    examDate: exam.e,
    schedulingMode: exam.sm === 1 ? ('steady' as const) : ('exam' as const),
  }));
  for (const assessment of assessments) {
    specificationAssessmentPointIds(assessment, payload.course);
  }
  validatePaperAssessmentDates(assessments);
}

export function parseSharePayload(payload: unknown): SharePayload {
  const parse = SharePayloadSchema.safeParse(payload);
  if (!parse.success) {
    throw new Error('This share code is from an unsupported version of Lacuna.');
  }
  if (parse.data.v === 1) {
    throw new Error(V1_SHARE_CODE_MESSAGE);
  }
  assertShareLessonPrerequisites(parse.data.lessons);
  assertShareSpecificationAssessments(parse.data as Exclude<SharePayload, SharePayloadV1>);
  if (parse.data.v === 4 || parse.data.v === 5 || parse.data.v === 6) {
    return {
      ...parse.data,
      questionSets: parse.data.questionSets.map(parseQuestionSetRecord),
      ...(parse.data.v === 5 || parse.data.v === 6
        ? {
            questionSetPracticeNodes: parse.data.questionSetPracticeNodes.map(
              parseQuestionSetPracticeNode,
            ),
          }
        : {}),
    } as SharePayloadV4 | SharePayloadV5 | SharePayloadV6;
  }
  return parse.data;
}
