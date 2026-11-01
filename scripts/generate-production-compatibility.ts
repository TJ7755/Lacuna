// Immutable source: verified deployment dpl_1Waugvh66WGWwfkW9uNt1bPu1dVY,
// SHA 191d86afdf4c2a0d6df8db9ddf243d785fb0dc7c, schema 31.
// Generated data is fictional; both database schema and backup exporter are historical.
import 'fake-indexeddb/auto';
import type { Table, IndexSpec } from 'dexie';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const sha = '191d86afdf4c2a0d6df8db9ddf243d785fb0dc7c';
const temporary = mkdtempSync(resolve('.historical-fixture-'));
try {
  const archive = execFileSync('git', ['archive', sha, 'src'], { maxBuffer: 100 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', temporary], { input: archive });
  symlinkSync(resolve('node_modules'), resolve(temporary, 'node_modules'));
  const { db: legacy } = await import(resolve(temporary, 'src/db/schema.ts'));
  const { exportDatabase } = await import(resolve(temporary, 'src/db/backupSnapshot.ts'));
  const { defaultFsrsParameters } = await import(resolve(temporary, 'src/fsrs/params.ts'));
  await legacy.delete();
  await legacy.open();
  const image = new Uint8Array(readFileSync('public/icons/icon-192.png'));
  const hash = createHash('sha256').update(image).digest('hex');
  const front = `Diagram ![diagram](lacuna-asset://${hash})`;
  const history = [
    {
      timestamp: 100,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    },
  ];
  await legacy.table('courses').add({
    id: 'course-1',
    name: 'Historical course',
    description: '',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 30,
    practiceThresholdMinutesNear: 15,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 3,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    createdAt: 1,
  });
  await legacy.table('lessons').add({
    id: 'lesson-1',
    courseId: 'course-1',
    name: 'Lesson',
    isExtension: false,
    orderIndex: 0,
    createdAt: 1,
  });
  await legacy.table('schedulingUnits').add({
    id: 'lesson-1',
    kind: 'lesson',
    name: 'Lesson',
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    createdAt: 1,
  });
  const course = await legacy.table('courses').get('course-1');
  await legacy.table('schedulingUnits').add({
    ...course,
    id: 'course-1',
    kind: 'course',
    courseId: 'course-1',
    lessonId: null,
    updatedAt: 1,
  });
  await legacy.table('schedulingUnits').update('lesson-1', { updatedAt: 1 });
  const performance = {
    m2: 0,
    runningMeanResponseTime: 0,
    runningStdDevResponseTime: 0,
    totalCorrectReviews: 0,
    updatedAt: 0,
  };
  await legacy.table('coursePerformance').add({ ...performance, courseId: 'course-1' });
  await legacy.table('schedulingPerformance').bulkAdd([
    { ...performance, schedulingUnitId: 'course-1', courseId: 'course-1' },
    { ...performance, schedulingUnitId: 'lesson-1', courseId: 'course-1', lessonId: 'lesson-1' },
  ]);
  await legacy.table('courseAssessments').add({
    id: 'final-1',
    courseId: 'course-1',
    name: 'Final',
    kind: 'final',
    afterLessonId: null,
    excludedCardIds: [],
    coverageMode: 'prefix',
    createdAt: 1,
  });
  await legacy.table('cards').add({
    id: 'old-card',
    conceptId: 'concept-1',
    updatedAt: 1,
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    schedulingUnitId: 'lesson-1',
    type: 'front_back',
    front,
    back: 'Tokyo',
    stability: 2,
    difficulty: 5,
    lastReviewed: 100,
    history: [],
    createdAt: 1,
    reps: 1,
    lapses: 0,
    state: 2,
    due: 1000,
    scheduledDays: 1,
    learningSteps: 0,
    tags: ['geography'],
    suspended: false,
    buriedUntil: null,
  });
  await legacy
    .table('assets')
    .add({ hash, blob: image, mimeType: 'image/png', width: 192, height: 192, createdAt: 1 });
  const reviewRows = [
    { ...history[0], id: 'review-1', cardId: 'old-card', schedulingUnitId: 'lesson-1' },
    {
      ...history[0],
      id: 'review-2',
      cardId: 'old-card',
      schedulingUnitId: 'lesson-1',
      timestamp: 200,
      grade: 1,
      responseTimeSec: 12.75,
      distracted: true,
      stabilityBefore: 2,
      stabilityAfter: 0.5,
      difficultyBefore: 5,
      difficultyAfter: 6,
      retrievabilityAtReview: 0.8,
    },
  ];
  await legacy.table('reviewHistory').bulkAdd(reviewRows);

  const { createConcept } = await import(resolve(temporary, 'src/questions/repository.ts'));
  const concept = await createConcept('course-1', 'Transport');
  const { createQuestionSet } = await import(
    resolve(temporary, 'src/questions/questionSetRepository.ts')
  );
  const attempts = await import(
    resolve(temporary, 'src/questions/questionSetAttemptRepository.ts')
  );
  const set = await createQuestionSet(
    {
      id: 'historical-set',
      courseId: 'course-1',
      title: 'Application',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'historical-question',
          prompt: 'Explain transport',
          parts: [],
          answer: {
            maxMarks: 5,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'application',
                criterion: 'Explains',
                maxMarks: 5,
                dimension: 'application',
                targetConceptIds: [concept.id],
                techniqueTags: {
                  taxonomyId: 'science-techniques',
                  taxonomyVersion: 1,
                  techniqueIds: ['causal-link'],
                  provenance: { source: 'author' },
                },
              },
            ],
          },
        },
      ],
    },
    100,
  );
  let attempt = await attempts.startQuestionSetAttempt(set.id, 'practice', 200);
  attempt = await attempts.submitPracticeQuestion(
    attempt.id,
    attempt.revisionId,
    'historical-question',
    210,
  );
  attempt = await attempts.saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: [{ allocationId: 'application', status: 'awarded', marks: 3 }],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: 'historical-question',
      activeAllocationId: null,
    },
    220,
  );
  await attempts.completeQuestionSetAttempt(attempt.id, attempt.revisionId, 230);

  const tables = Object.fromEntries(
    await Promise.all(
      legacy.tables.map(async (table: Table) => [
        table.name,
        {
          schema:
            table.schema.primKey.src +
            (table.schema.indexes.length
              ? ',' + table.schema.indexes.map((index: IndexSpec) => index.src).join(',')
              : ''),
          rows: await table.toArray(),
        },
      ]),
    ),
  );
  // Serialised IndexedDB records, not an export reinterpreted as database rows.
  writeFileSync(
    'tests/fixtures/compatibility/production-191d86a-db.json',
    JSON.stringify({ sha, version: legacy.verno, tables }, null, 2) + '\n',
  );
  writeFileSync(
    'tests/fixtures/compatibility/production-191d86a-backup.json',
    JSON.stringify(await exportDatabase(), null, 2) + '\n',
  );
  await legacy.delete();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
