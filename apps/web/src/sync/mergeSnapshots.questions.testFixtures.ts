import type { BackupAsset, BackupFile, CourseRecord } from '../db/types';
import { defaultFsrsParameters } from '../fsrs/params';
import type {
  Concept,
  FixedQuestionDefinition,
  QuestionAttempt,
  QuestionConceptSet,
} from '../questions/types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';

const PARAMS = defaultFsrsParameters();

export function course(overrides: Partial<CourseRecord> = {}): CourseRecord {
  return {
    id: 'course-1',
    name: 'Course',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    fsrsVersion: 6,
    fsrsParameters: PARAMS,
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
    ...overrides,
  };
}

export function concept(): Extract<Concept, { scope: 'course' }> {
  return {
    id: 'concept-1',
    scope: 'course',
    scopeKey: 'course:course-1',
    courseId: 'course-1',
    name: 'Addition',
    provisional: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

export function question(
  revision = 'authoring-1',
  authoringUpdatedAt = 10,
  overrides: Partial<FixedQuestionDefinition> = {},
): FixedQuestionDefinition {
  return {
    id: 'question-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Addition',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt: 'Calculate 1 + 1',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    explanation: 'One plus one is two.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: `content:${revision}`,
    authoringRevisionId: revision,
    authoringUpdatedAt,
    scheduleEpoch: {
      id: `epoch:${revision}`,
      startedAt: authoringUpdatedAt,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    scheduleUpdatedAt: authoringUpdatedAt,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    createdAt: 1,
    updatedAt: authoringUpdatedAt,
    ...overrides,
  };
}

export function links(revision = 'authoring-1', at = 10): QuestionConceptSet {
  return {
    questionId: 'question-1',
    courseId: 'course-1',
    targetConceptIds: ['concept-1'],
    prerequisiteConceptIds: [],
    authoringRevisionId: revision,
    authoringUpdatedAt: at,
    createdAt: 1,
    updatedAt: at,
  };
}

export function attempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'question-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content:authoring-1',
    scheduleEpochId: 'epoch:authoring-1',
    purpose: 'post-instruction',
    shownAt: 20,
    updatedAt: 20,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: 'Calculate 1 + 1',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    renderedExplanation: 'One plus one is two.',
    scheduleEffect: { kind: 'none' },
    sessionId: 'session-1',
    ...overrides,
  };
}

export function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 11,
    exportedAt: 1,
    cards: [],
    concepts: [concept()],
    questions: [question()],
    questionConcepts: [links()],
    questionAttempts: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    courses: [course()],
    ...overrides,
  };
}

export function asset(hash: string): BackupAsset {
  return {
    hash,
    data: 'Zg==',
    mimeType: 'image/png',
    kind: 'image',
    createdAt: 1,
  };
}

export function authoredSet(prompt = 'Explain addition.'): QuestionSetRecord {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'set-question-1',
        prompt,
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Explains it.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: ['concept-1'],
            },
          ],
        },
      },
    ],
    contentVersion: 1,
    contentRevisionId: 'set-revision-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

export function setAttempt(
  overrides: Partial<QuestionSetAttemptRecord> = {},
): QuestionSetAttemptRecord {
  return {
    id: 'set-attempt-1',
    courseId: 'course-1',
    questionSetId: 'set-1',
    receipt: authoredSet(),
    mode: 'paper',
    status: 'answering',
    responses: [{ nodeId: 'set-question-1', draft: { kind: 'written', text: '' } }],
    decisions: [],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    assistance: [],
    revealedQuestionIds: [],
    activeNodeId: 'set-question-1',
    activeAllocationId: null,
    revisionId: 'attempt-revision-1',
    createdAt: 20,
    updatedAt: 20,
    ...overrides,
  };
}
