import {
  specificationAssessmentPointIds,
  validatePaperAssessmentDates,
} from '../specifications/assessment';
import { assertShareLessonPrerequisites } from './lessonPrerequisites';
import { parseQuestionSetPracticeNode } from './questionSetPracticeNode';
import type { ItemPayload, QuestionSetPracticeNode, UnlockMode } from './types';
import type { QuestionPayload } from '../questions/types';
import { parseQuestionSetRecord, type QuestionSetRecord } from '../questions/questionSetCodec';
import type { Specification } from '../specifications/catalogue';
import type { SpecificationReference } from '../specifications/links';

import { SharePayloadSchema } from './sharePayloadSchema';

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
