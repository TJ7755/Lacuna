import { z } from 'zod';
import { itemPayloadIsValid } from '../items/payloadValidation';
import { parseQuestionSetRecord } from '../questions/questionSetCodec';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import { parseQuestionSetPracticeNode } from './questionSetPracticeNode';

export const text = z.string();
export const id = text.min(1);
export const number = z.number().finite();
export const ids = z.array(id);
export const strings = z.array(text);
export const flag = z.boolean();
export const timestamps = { createdAt: number, updatedAt: number.optional() };
export const answerMode = z.enum(['reveal', 'type']).optional();
export const payload = z.unknown().refine(itemPayloadIsValid, 'Invalid structured item payload');
export const object = z.looseObject;
export const parameters = object({
  w: z.array(number),
  requestRetention: number,
  enable_fuzz: flag.optional(),
  maximum_interval: number.optional(),
  learning_steps: strings.optional(),
  relearning_steps: strings.optional(),
});
const scheduler = {
  id,
  examDate: number.optional(),
  examObjective: z.enum(['expectedMarks', 'securedTopics']),
  fsrsParameters: parameters,
  archived: flag.optional(),
  newCardsPerDay: number.optional(),
  maxReviewsPerDay: number.optional(),
  leechThreshold: number.optional(),
  leechAction: z.enum(['suspend', 'tag', 'none']).optional(),
};
export const verdict = object({
  studentLine: text,
  matchedLineIndex: number.nullable(),
  marksEarned: number,
  checkerSeeds: strings.optional(),
  undetermined: z.literal(true).optional(),
});
export const dispute = object({
  reportedAt: number,
  question: text,
  studentLine: text,
  verdict: object({
    correct: flag,
    marksEarned: number,
    matchedLineIndex: number.nullable().optional(),
    undetermined: z.literal(true).optional(),
  }),
  checkerSeeds: strings,
});
export const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export const schedule = {
  stability: number.nullable(),
  difficulty: number.nullable(),
  lastReviewed: number.nullable(),
  reps: number,
  lapses: number,
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  due: number.nullable(),
  scheduledDays: number,
  learningSteps: number,
};
export const review = object({
  eventId: id.optional(),
  sessionId: id.optional(),
  sessionKind: z
    .enum(['deck', 'lesson', 'practice', 'assessment-revision', 'revision-plan'])
    .optional(),
  revisionPlanId: id.optional(),
  revisionWindowId: id.optional(),
  timestamp: number,
  grade,
  correct: flag.optional(),
  responseTimeSec: number,
  distracted: flag,
  hintUsed: flag.optional(),
  primed: flag.optional(),
  stabilityBefore: number.nullable(),
  stabilityAfter: number,
  difficultyBefore: number.nullable(),
  difficultyAfter: number,
  retrievabilityAtReview: number.nullable(),
  fsrsWeightsFingerprint: text.optional(),
  marksEarned: number.optional(),
  marksAvailable: number.optional(),
  lineVerdicts: z.array(verdict).optional(),
  checkerDisputes: z.array(dispute).optional(),
});
export const cardContent = object({
  answerMode,
  type: z.enum(['front_back', 'basic_reversed', 'cloze', 'typing']),
  front: text,
  back: text,
  tags: strings.optional(),
  payload: payload.optional(),
});
export const card = cardContent
  .extend({
    ...timestamps,
    ...schedule,
    id,
    conceptId: id.optional(),
    deckId: id.optional(),
    courseId: id.nullable().optional(),
    primaryLessonId: id.nullable().optional(),
    schedulingUnitId: id.optional(),
    history: z.array(review),
    reps: number.optional(),
    lapses: number.optional(),
    state: schedule.state.optional(),
    due: number.nullable().optional(),
    scheduledDays: number.optional(),
    learningSteps: number.optional(),
    suspended: flag.optional(),
    flagged: flag.optional(),
    buriedUntil: number.nullable().optional(),
    reverseCardId: id.nullable().optional(),
    sequenceItemId: id.optional(),
    occlusionRegionId: id.optional(),
  })
  .refine(
    (row) => row.payload === undefined || row.type === 'front_back',
    'Payload requires a front/back card',
  );
export const lessonContent = object({
  answerMode,
  name: text,
  description: text.optional(),
  orderIndex: number,
  isExtension: flag,
  examDate: number.optional(),
  timeZone: text.optional(),
  releaseDate: number.optional(),
  unlockedAt: number.optional(),
  sessionFilter: z.enum(['new', 'due', 'mixed']).optional(),
});
export const lesson = lessonContent.extend({ ...timestamps, id, courseId: id });
export const noteContent = object({ name: text, content: text, orderIndex: number });
export const note = noteContent.extend({ ...timestamps, id, lessonId: id });
const distribution = object({
  lineageId: id,
  revision: number,
  publishedAt: number,
  shareId: id.optional(),
  shareRevision: number.optional(),
});
export const course = object({
  ...scheduler,
  ...timestamps,
  name: text,
  description: text,
  fsrsVersion: number,
  examBoard: text.optional(),
  specification: text.optional(),
  colour: text.optional(),
  examDatePromptDismissed: flag.optional(),
  learnFirst: flag.optional(),
  autoOptimise: flag.optional(),
  dailyReviewGoal: number.optional(),
  sessionTimeLimitMinutes: number.optional(),
  lastInteractedAt: number.optional(),
  unlockMode: z.enum(['linear', 'semi-linear', 'open']),
  linearCadence: object({ anchorDate: number, intervalDays: number }).optional(),
  autoPractice: flag,
  practiceThresholdMinutesFar: number,
  practiceThresholdMinutesNear: number,
  practiceUrgentWindowDays: number,
  practiceMaxGap: number,
  lessonViewMode: z.enum(['study', 'edit']).optional(),
  distribution: distribution.optional(),
  distributedCopy: object({
    lineageId: id,
    revision: number,
    locked: flag,
    autoAcceptUpdates: flag,
    sourceLabel: text.optional(),
  }).optional(),
});
export const assessment = object({
  ...timestamps,
  id,
  courseId: id,
  name: text,
  kind: z.enum(['final', 'checkpoint']),
  schedulingMode: z.enum(['exam', 'steady']).optional(),
  examDate: number.optional(),
  timeZone: text.optional(),
  afterLessonId: id.nullable(),
  excludedCardIds: ids,
  needsAuthorConfirmation: flag.optional(),
  coverageMode: z.enum(['prefix', 'custom']),
  lessonIds: ids.optional(),
}).refine(
  (row) => row.coverageMode !== 'custom' || row.lessonIds !== undefined,
  'Custom coverage requires lessonIds',
);
const performance = {
  runningMeanResponseTime: number,
  runningStdDevResponseTime: number,
  m2: number,
  totalCorrectReviews: number,
};

// Authored aggregates already have strict codecs; reuse them rather than mirroring
// their nested shape here.
function codec(parse: (value: unknown) => unknown, message: string) {
  return z.unknown().refine((value) => {
    try {
      parse(value);
      return true;
    } catch {
      return false;
    }
  }, message);
}

export const recordSchemas = {
  cards: card,
  assets: object({
    hash: id,
    data: text,
    mimeType: text,
    kind: z.enum(['image', 'audio']).optional(),
    width: number.optional(),
    height: number.optional(),
    createdAt: number,
  }),
  sessionHistory: object({
    id: number.optional(),
    eventId: id.optional(),
    sessionId: id.optional(),
    revisionPlanId: id.optional(),
    revisionWindowId: id.optional(),
    timestamp: number,
    deckId: text,
    courseId: id.optional(),
    schedulingUnitId: id.optional(),
    averagePredictedRetrievability: number,
  }),
  userPerformance: object({ ...performance, deckId: id, courseId: id.optional() }),
  courses: course,
  lessons: lesson,
  notes: note,
  lessonCards: object({ ...timestamps, id, lessonId: id, cardId: id }),
  lessonCardExposures: object({
    lessonId: id,
    cardId: id,
    taughtAt: number,
    updatedAt: number.optional(),
  }),
  lessonCompletions: object({ lessonId: id, completedAt: number, updatedAt: number.optional() }),
  practiceNodes: z.union([
    object({
      ...timestamps,
      id,
      courseId: id,
      type: z.enum(['auto', 'manual']),
      position: number.optional(),
      name: text,
      lessonIds: ids.optional(),
      filters: z.array(z.enum(['new', 'due', 'flagged', 'suspended', 'leech'])).optional(),
      cardCount: number.optional(),
      randomize: flag.optional(),
    }),
    codec(parseQuestionSetPracticeNode, 'Invalid question set practice node'),
  ]),
  practiceMilestones: object({
    nodeKey: id,
    courseId: id,
    scopeVersion: text,
    securedCardCount: number,
    totalCardCount: number,
    updatedAt: number,
    completedAt: number.optional(),
  }),
  courseAssessments: assessment,
  courseExamDates: object({
    id,
    courseId: id,
    name: text,
    examDate: number,
    timeZone: text.optional(),
    lessonIds: ids.optional(),
    excludedCardIds: ids.optional(),
    createdAt: number,
  }),
  sequences: object({
    ...timestamps,
    id,
    courseId: id,
    primaryLessonId: id.nullable(),
    name: text,
    description: text.optional(),
    mode: z.enum(['list', 'lines']).optional(),
    items: z.array(
      object({
        id,
        value: text,
        label: text.optional(),
        chunkIndex: number.optional(),
        speaker: text.optional(),
      }),
    ),
    cueWindow: number,
    chunkLabels: strings.optional(),
    generateLabelCards: flag.optional(),
    mySpeaker: text.optional(),
    presetId: z.enum(['list', 'poetry', 'script', 'speech', 'procedure', 'timeline']).optional(),
  }),
  occlusions: object({
    ...timestamps,
    id,
    courseId: id,
    primaryLessonId: id.nullable(),
    name: text,
    assetHash: id,
    regions: z.array(
      object({
        id,
        role: z.enum(['label', 'feature']),
        shape: z.literal('rectangle'),
        x: number,
        y: number,
        w: number,
        h: number,
        answerText: text.optional(),
        pairedRegionId: id.optional(),
        backNote: text.optional(),
      }),
    ),
  }),
  reviewHistory: review.extend({
    id,
    cardId: id,
    deckId: id.optional(),
    courseId: id.nullable().optional(),
    primaryLessonId: id.nullable().optional(),
    schedulingUnitId: id.optional(),
  }),
  schedulingUnits: object({
    ...scheduler,
    ...timestamps,
    // Earlier v21 projections omit this metadata; import rebuilds those units.
    createdAt: number.optional(),
    fsrsVersion: number,
    examDatePromptDismissed: flag.optional(),
    kind: z.enum(['course', 'lesson', 'legacy-deck']),
    courseId: id.nullable(),
    lessonId: id.nullable(),
    name: text,
    timeZone: text.optional(),
    autoOptimise: flag.optional(),
    dailyReviewGoal: number.optional(),
    sessionTimeLimitMinutes: number.optional(),
    colour: text.optional(),
    lastInteractedAt: number.optional(),
  }),
  coursePerformance: object({ ...performance, courseId: id, updatedAt: number.optional() }),
  schedulingPerformance: object({
    ...performance,
    schedulingUnitId: id,
    courseId: id.optional(),
    lessonId: id.optional(),
    updatedAt: number.optional(),
  }),
  tombstones: object({ table: id, recordId: id, deletedAt: number }),
  questionSets: codec(parseQuestionSetRecord, 'Invalid question set'),
  questionSetAttempts: codec(parseQuestionSetAttemptRecord, 'Invalid question set attempt'),
};
