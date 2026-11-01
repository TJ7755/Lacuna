import type {
  Card,
  SessionHistoryEntry,
  UserPerformance,
  BackupFile,
  MediaAsset,
  LegacyFolder,
  LegacyDeck,
  Course,
  CourseAssessment,
  Lesson,
  Note,
  LessonCardLink,
  LessonCardExposure,
  LessonCompletion,
  PracticeNode,
  PracticeMilestone,
  Sequence,
  RevisionPlan,
  LineageIdMapping,
  PendingMergeReview,
  Occlusion,
  SchedulingUnitRecord,
  CoursePerformance,
  SchedulingPerformance,
  Tombstone,
  AgentMemory,
} from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type { LegacyAssessmentRecord } from './assessmentMigration';
import { encodeBackupAssets } from './assetCodec';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
export async function readAllDataFromVersion(
  name: string,
  expectedVersion?: number,
): Promise<BackupFile> {
  const raw = await new Promise<{
    version: number;
    data: Record<string, unknown[]>;
  }>((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const idb = req.result;
      const stores = Array.from(idb.objectStoreNames);
      const result: Record<string, unknown[]> = {};

      if (stores.length === 0) {
        idb.close();
        resolve({ version: idb.version, data: result });
        return;
      }

      const tx = idb.transaction(stores, 'readonly');
      let pending = stores.length;
      let failed = false;

      for (const storeName of stores) {
        const storeReq = tx.objectStore(storeName).getAll();
        storeReq.onsuccess = (e) => {
          if (failed) return;
          result[storeName] = (e.target as IDBRequest).result;
          pending--;
          if (pending === 0) {
            idb.close();
            resolve({ version: idb.version, data: result });
          }
        };
        storeReq.onerror = () => {
          if (failed) return;
          failed = true;
          idb.close();
          reject(storeReq.error);
        };
      }

      tx.onerror = () => {
        if (failed) return;
        failed = true;
        idb.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another connection'));
  });

  const schemaVersion = raw.version / 10;
  if (expectedVersion !== undefined && schemaVersion !== expectedVersion) {
    throw new Error(
      `Database version mismatch: expected ${expectedVersion}, found ${schemaVersion}`,
    );
  }

  const assetsRaw = (raw.data['assets'] ?? []) as MediaAsset[];
  const assets = await encodeBackupAssets(assetsRaw);

  const payload: BackupFile = {
    app:
      schemaVersion >= 31
        ? 'lacuna-v15'
        : schemaVersion < 24
          ? 'lacuna'
          : schemaVersion < 29
            ? 'lacuna-v12'
            : 'lacuna-v13',
    version:
      schemaVersion >= 31 ? 15 : schemaVersion < 24 ? schemaVersion : schemaVersion < 29 ? 12 : 13,
    exportedAt: Date.now(),
    decks: (raw.data['decks'] ?? []) as LegacyDeck[],
    cards: (raw.data['cards'] ?? []) as Card[],
    assets,
    sessionHistory: (raw.data['sessionHistory'] ?? []) as SessionHistoryEntry[],
    userPerformance: (raw.data['userPerformance'] ?? []) as UserPerformance[],
    folders: (raw.data['folders'] ?? []) as LegacyFolder[],
    courses: (raw.data['courses'] ?? []) as Course[],
    lessons: (raw.data['lessons'] ?? []) as Lesson[],
    notes: (raw.data['notes'] ?? []) as Note[],
    lessonCards: (raw.data['lessonCards'] ?? []) as LessonCardLink[],
    lessonCardExposures: (raw.data['lessonCardExposures'] ?? []) as LessonCardExposure[],
    lessonCompletions: (raw.data['lessonCompletions'] ?? []) as LessonCompletion[],
    practiceNodes: (raw.data['practiceNodes'] ?? []) as PracticeNode[],
    practiceMilestones: (raw.data['practiceMilestones'] ?? []) as PracticeMilestone[],
    courseAssessments: (raw.data['courseAssessments'] ?? []) as CourseAssessment[],
    revisionPlans: (raw.data['revisionPlans'] ?? []) as RevisionPlan[],
    reviewHistory: (raw.data['reviewHistory'] ?? []) as ReviewHistoryEntry[],
    schedulingUnits: (raw.data['schedulingUnits'] ?? []) as SchedulingUnitRecord[],
    coursePerformance: (raw.data['coursePerformance'] ?? []) as CoursePerformance[],
    schedulingPerformance: (raw.data['schedulingPerformance'] ?? []) as SchedulingPerformance[],
    sequences: (raw.data['sequences'] ?? []) as Sequence[],
    occlusions: (raw.data['occlusions'] ?? []) as Occlusion[],
    tombstones: (raw.data['tombstones'] ?? []) as Tombstone[],
    concepts: (raw.data['concepts'] ?? []) as Concept[],
    questions: (raw.data['questions'] ?? []) as QuestionDefinition[],
    questionConcepts: (raw.data['questionConcepts'] ?? []) as QuestionConceptSet[],
    questionAttempts: (raw.data['questionAttempts'] ?? []) as QuestionAttempt[],
    questionSets: (raw.data['questionSets'] ?? []) as QuestionSetRecord[],
    questionSetAttempts: (raw.data['questionSetAttempts'] ?? []) as QuestionSetAttemptRecord[],
    lineageIdMappings: (raw.data['lineageIdMappings'] ?? []) as LineageIdMapping[],
    pendingMergeReviews: (raw.data['pendingMergeReviews'] ?? []) as PendingMergeReview[],
    agentMemories: (raw.data['agentMemories'] ?? []) as AgentMemory[],
  };

  // A v13 pre-migration snapshot must retain the retired store byte-for-byte.
  // It remains an extra legacy property until the later portability task owns
  // explicit old-backup import semantics.
  const legacyAssessments = (raw.data['courseExamDates'] ?? []) as LegacyAssessmentRecord[];
  if (legacyAssessments.length > 0) {
    payload.courseExamDates = legacyAssessments;
  }
  return payload;
}
