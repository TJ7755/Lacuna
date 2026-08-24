import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultFsrsParameters } from '../fsrs/params';
import { assetUrl, storeImageBlob } from './assets';
import { BACKUP_VERSION, exportDatabase, importBackup, validateBackup } from './portability';
import { db } from './schema';
import type { BackupFile, Card, CourseRecord } from './types';
import type {
  Concept,
  FixedQuestionDefinition,
  QuestionAttempt,
  QuestionConceptSet,
} from '../questions/types';

const COURSE: CourseRecord = {
  id: 'course-1',
  name: 'Chemistry',
  description: '',
  createdAt: 1,
  updatedAt: 1,
  fsrsVersion: 6,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 14,
  practiceMaxGap: 2,
};

const FINAL_ASSESSMENT = {
  id: 'assessment-final',
  courseId: COURSE.id,
  name: 'Final assessment',
  kind: 'final' as const,
  examDate: Date.parse('2027-06-01T12:00:00Z'),
  afterLessonId: null,
  excludedCardIds: [],
  coverageMode: 'prefix' as const,
  createdAt: 1,
  updatedAt: 1,
};

function question(prompt = 'Calculate 1 + 1'): FixedQuestionDefinition {
  return {
    id: 'question-1',
    courseId: COURSE.id,
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Addition',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt,
    payload: {
      v: 1,
      kind: 'numeric',
      answer: { kind: 'exact', value: '2' },
    },
    explanation: 'One plus one is two.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: 10,
    scheduleEpoch: { id: 'epoch-1', startedAt: 10, reason: 'created', baseline: { kind: 'new' } },
    scheduleUpdatedAt: 10,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    createdAt: 10,
    updatedAt: 10,
  };
}

const CONCEPT: Concept = {
  id: 'concept-1',
  scope: 'course',
  scopeKey: `course:${COURSE.id}`,
  courseId: COURSE.id,
  name: 'Addition',
  provisional: false,
  createdAt: 5,
  updatedAt: 5,
};

const LINKS: QuestionConceptSet = {
  questionId: 'question-1',
  courseId: COURSE.id,
  targetConceptIds: [CONCEPT.id],
  prerequisiteConceptIds: [],
  authoringRevisionId: 'authoring-1',
  authoringUpdatedAt: 10,
  createdAt: 10,
  updatedAt: 10,
};

function shownAttempt(renderedExplanation = 'One plus one is two.'): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'question-1',
    courseId: COURSE.id,
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: 20,
    updatedAt: 20,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: 'Calculate 1 + 1',
    resolvedPayload: {
      v: 1,
      kind: 'numeric',
      answer: { kind: 'exact', value: '2' },
    },
    renderedExplanation,
    scheduleEffect: { kind: 'none' },
    sessionId: 'session-1',
  };
}

async function reset(): Promise<void> {
  db.close();
  await db.delete();
  await db.open();
}

describe('Question backup portability', () => {
  beforeEach(reset);

  it('exports and replace-restores every Question table and its receipt-only assets', async () => {
    const definitionAsset = await storeImageBlob(
      new Blob(['definition'], { type: 'image/png' }),
      'image/png',
      1,
      1,
    );
    const receiptAsset = await storeImageBlob(
      new Blob(['receipt'], { type: 'image/png' }),
      'image/png',
      1,
      1,
    );
    await db.courses.add(COURSE);
    await db.courseAssessments.add(FINAL_ASSESSMENT);
    await db.concepts.add(CONCEPT);
    await db.questions.add(
      question(`Calculate 1 + 1\n\n![diagram](${assetUrl(definitionAsset.hash)})`),
    );
    await db.questionConcepts.add(LINKS);
    await db.questionAttempts.add(
      shownAttempt(`Worked solution\n\n![receipt](${assetUrl(receiptAsset.hash)})`),
    );

    const backup = await exportDatabase();

    expect(backup.version).toBe(11);
    expect(backup.concepts).toEqual([CONCEPT]);
    expect(backup.questions).toHaveLength(1);
    expect(backup.questionConcepts).toEqual([LINKS]);
    expect(backup.questionAttempts).toHaveLength(1);
    expect(backup.assets.map((asset) => asset.hash).sort()).toEqual(
      [definitionAsset.hash, receiptAsset.hash].sort(),
    );
    await reset();
    await importBackup(backup, 'replace');

    expect(await db.concepts.toArray()).toEqual([CONCEPT]);
    expect(await db.questions.toArray()).toEqual(backup.questions);
    expect(await db.questionConcepts.toArray()).toEqual([LINKS]);
    expect(await db.questionAttempts.toArray()).toEqual(backup.questionAttempts);
    expect(await db.assets.count()).toBe(2);
  });

  it('converts structured Cards in a v10 backup through the v24 adapter', async () => {
    const legacyCard = {
      id: 'structured-card',
      type: 'front_back',
      front: 'Calculate 1 + 1',
      back: 'One plus one is two.',
      payload: {
        v: 1,
        kind: 'numeric',
        answer: { kind: 'exact', value: '2' },
      },
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      schedulingUnitId: COURSE.id,
      courseId: COURSE.id,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 10,
      updatedAt: 10,
    } as unknown as Card;
    const oldBackup: BackupFile = {
      app: 'lacuna',
      version: 10,
      exportedAt: 20,
      cards: [legacyCard],
      assets: [],
      sessionHistory: [],
      userPerformance: [],
      courses: [COURSE],
      courseAssessments: [FINAL_ASSESSMENT],
      reviewHistory: [],
    };

    await importBackup(oldBackup, 'replace');

    expect(await db.cards.count()).toBe(0);
    expect(await db.concepts.count()).toBe(1);
    expect(await db.questions.toArray()).toEqual([
      expect.objectContaining({ kind: 'fixed', prompt: 'Calculate 1 + 1' }),
    ]);
    expect(await db.questionConcepts.count()).toBe(1);
  });

  it('recover-merges attempt lifecycle state and replays Question scheduling', async () => {
    await db.courses.add(COURSE);
    await db.courseAssessments.add(FINAL_ASSESSMENT);
    await db.concepts.add(CONCEPT);
    await db.questions.add(question());
    await db.questionConcepts.add(LINKS);
    await db.questionAttempts.add(shownAttempt());
    const remote = await exportDatabase();
    remote.questionAttempts![0] = {
      ...remote.questionAttempts![0],
      status: 'answered',
      answeredAt: 30,
      updatedAt: 30,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      grade: 3,
      scheduleEffect: { kind: 'replay', grade: 3 },
    };

    await importBackup(remote, 'merge');

    expect(await db.questionAttempts.get('attempt-1')).toMatchObject({
      status: 'answered',
      submittedAnswer: '2',
    });
    expect(await db.questions.get('question-1')).toMatchObject({ reps: 1, lastReviewed: 30 });
  });

  it('requires all Question collections in a current backup', () => {
    const incomplete: BackupFile = {
      app: 'lacuna',
      version: BACKUP_VERSION,
      exportedAt: 1,
      cards: [],
      assets: [],
      sessionHistory: [],
      userPerformance: [],
    };

    expect(validateBackup(incomplete)).toBe(false);
  });
});
