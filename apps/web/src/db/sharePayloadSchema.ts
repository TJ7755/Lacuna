import { z } from 'zod';
import { CURRENT_ITEM_PAYLOAD_VERSION } from '@lacuna/core/db/types';
import { itemPayloadIsValid } from '../items/payloadValidation';
import {
  specificationPointIdsSchema,
  specificationRefSchema,
  specificationDataSchema,
  specificationCoverageFields,
  validSpecificationCoverageSelector,
} from '../specifications/linkSchemas';
import { assertCourseSpecificationSelection } from '../specifications/data';

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

export const SharePayloadSchema = z.discriminatedUnion('v', [
  SharePayloadV1Schema,
  SharePayloadV2Schema,
  SharePayloadV3Schema,
  SharePayloadV4Schema,
  SharePayloadV5Schema,
  SharePayloadV6Schema,
]);
