import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import type { CourseRecord } from '@lacuna/core/db/types';
import type {
  Concept,
  QuestionConceptSet,
  FixedQuestionDefinition,
} from '@lacuna/core/questions/types';
import { db } from './schema';
import { createCourse } from './repository';
import { exportDatabase, importBackup, readBackupFile } from './portability';

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

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// Both refs use src/db/backupSnapshot.ts and src/db/portability.ts: the v15
// exporter copies these collections verbatim, with no assessment or scheduling conversion.
it.each(['ba3e2c84ad5caa8a41f94b5f4129c5e1df392273', 'v0.2.17'])(
  'preserves representative emitted rows from %s',
  async () => {
    await createCourse('Seed');
    const fixture = await exportDatabase();
    fixture.courses = [COURSE];
    fixture.courseAssessments = [FINAL_ASSESSMENT];
    fixture.questions = [question()];
    fixture.concepts = [CONCEPT];
    fixture.questionConcepts = [LINKS];
    fixture.schedulingUnits = fixture.schedulingUnits!.map((unit) => ({
      ...unit,
      id: COURSE.id,
      courseId: COURSE.id,
    }));
    const performance = {
      runningMeanResponseTime: 123,
      runningStdDevResponseTime: 7,
      m2: 49,
      totalCorrectReviews: 3,
      updatedAt: 10,
    };
    fixture.coursePerformance = [{ ...performance, courseId: COURSE.id }];
    fixture.schedulingPerformance = [
      { ...performance, schedulingUnitId: COURSE.id, courseId: COURSE.id },
    ];
    const parsed = await readBackupFile(new File([JSON.stringify(fixture)], 'backup.json'));
    await importBackup(parsed, 'replace');
    const restored = await exportDatabase();
    for (const key of [
      'courses',
      'courseAssessments',
      'questions',
      'schedulingUnits',
      'coursePerformance',
      'schedulingPerformance',
    ] as const) {
      expect(restored[key]).toEqual(fixture[key]);
      expect(fixture[key]!.length).toBeGreaterThan(0);
    }
    for (const mode of ['replace', 'merge'] as const) {
      const old = { ...fixture, app: 'lacuna' as const, version: 9 };
      await expect(importBackup(old, mode)).rejects.toThrow('Unsupported old backup');
      await expect(readBackupFile(new File([JSON.stringify(old)], 'old.json'))).rejects.toThrow(
        'Unsupported old backup',
      );
      const after = await exportDatabase();
      expect({ ...after, exportedAt: 0 }).toEqual({ ...restored, exportedAt: 0 });
    }
  },
);

it.each(['schedulingUnits', 'coursePerformance', 'schedulingPerformance'] as const)(
  'rejects current backups missing %s without changing stored data',
  async (key) => {
    await createCourse('Protected');
    const before = await exportDatabase();
    const malformed = { ...before };
    delete malformed[key];
    for (const mode of ['replace', 'merge'] as const) {
      await expect(importBackup(malformed, mode)).rejects.toThrow(key);
      await expect(
        readBackupFile(new File([JSON.stringify(malformed)], 'bad.json')),
      ).rejects.toThrow(key);
      const after = await exportDatabase();
      expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
    }
  },
);
