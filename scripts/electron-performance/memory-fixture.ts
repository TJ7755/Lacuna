import { createHash } from 'node:crypto';
import { defaultFsrsParameters, FSRS_VERSION } from '../../src/fsrs/params';
import type { BackupFile, Card, CourseAssessment, CourseRecord, Lesson } from '../../src/db/types';
import type { Concept } from '../../src/questions/types';

const FIXTURE_TIME = Date.UTC(2026, 8, 1, 12, 0, 0);
const COURSE_ID = 'memory-course-0001';
const BACKUP_VERSION = 11;
const LESSON_COUNT = 100;
const CARD_COUNT = 10_000;

function padded(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function createLargeMemoryFixture(): BackupFile {
  const course: CourseRecord = {
    id: COURSE_ID,
    name: 'Memory benchmark course',
    description: 'Deterministic 10,000-Card fixture for packaged Electron memory measurements.',
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 12,
    practiceThresholdMinutesNear: 8,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 3,
    lessonViewMode: 'study',
  };
  const lessons: Lesson[] = Array.from({ length: LESSON_COUNT }, (_, index) => {
    const number = index + 1;
    return {
      id: `memory-lesson-${padded(number, 3)}`,
      courseId: COURSE_ID,
      name: `Memory lesson ${number}`,
      description: `Deterministic lesson ${number} of ${LESSON_COUNT}.`,
      orderIndex: index,
      createdAt: FIXTURE_TIME + number,
      updatedAt: FIXTURE_TIME + number,
      isExtension: false,
    };
  });
  const cards: Card[] = Array.from({ length: CARD_COUNT }, (_, index) => {
    const number = index + 1;
    const lesson = lessons[index % LESSON_COUNT]!;
    const timestamp = FIXTURE_TIME + LESSON_COUNT + number;
    return {
      id: `memory-card-${padded(number, 5)}`,
      conceptId: `memory-concept-${padded(number, 5)}`,
      schedulingUnitId: lesson.id,
      courseId: COURSE_ID,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: `Memory benchmark prompt ${number}`,
      back: `Memory benchmark answer ${number}`,
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      tags: [],
      suspended: false,
      flagged: false,
      buriedUntil: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const concepts: Concept[] = cards.map((card, index) => ({
    id: card.conceptId,
    scope: 'course',
    scopeKey: `course:${COURSE_ID}`,
    courseId: COURSE_ID,
    name: `Memory benchmark concept ${index + 1}`,
    provisional: false,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  }));
  const finalAssessment: CourseAssessment = {
    id: 'memory-assessment-final',
    courseId: COURSE_ID,
    name: 'Steady retention',
    kind: 'final',
    schedulingMode: 'steady',
    afterLessonId: lessons.at(-1)!.id,
    coverageMode: 'prefix',
    excludedCardIds: [],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };

  return {
    app: 'lacuna',
    version: BACKUP_VERSION,
    exportedAt: FIXTURE_TIME,
    cards,
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    courses: [course],
    lessons,
    notes: [],
    lessonCards: [],
    lessonCardExposures: [],
    lessonCompletions: [],
    practiceNodes: [],
    practiceMilestones: [],
    courseAssessments: [finalAssessment],
    sequences: [],
    occlusions: [],
    revisionPlans: [],
    reviewHistory: [],
    schedulingUnits: [],
    coursePerformance: [],
    schedulingPerformance: [],
    tombstones: [],
    concepts,
    questions: [],
    questionConcepts: [],
    questionAttempts: [],
    lineageIdMappings: [],
    pendingMergeReviews: [],
    agentMemories: [],
  };
}

export function fingerprintMemoryFixture(fixture: BackupFile): string {
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}
