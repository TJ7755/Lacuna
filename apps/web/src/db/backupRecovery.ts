import { assertSpecificationAssessmentReferences } from '../specifications/assessment';
import { assertLessonPrerequisites } from '@lacuna/core/db/lessonPrerequisites';
import { db } from './schema';
import { addReviewHistoryInBatches } from './addReviewHistoryInBatches';
import type {
  Card,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  Occlusion,
  PracticeNode,
  PracticeMilestone,
  Sequence,
  SessionHistoryEntry,
  UserPerformance,
  Tombstone,
  AgentMemory,
  LineageIdMapping,
  PendingMergeReview,
} from '@lacuna/core/db/types';
import {
  projectCardsForStorage,
  resolveReviewHistoryCollisions,
  type ReviewHistoryCollisionState,
} from '@lacuna/core/db/reviewHistory';
import { mergeQuestionCollections } from '../questions/merge';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import { mergeQuestionSetAttemptPair } from '../questions/questionSetAttemptMerge';
import { assertQuestionSetPracticeNodeReferences } from '@lacuna/core/db/questionSetPracticeNode';
import type { PreparedBackup } from './backupPreparation';
import { mergeLineageMappings, newestWins } from '../sync/snapshotRecords';
import {
  planRecoveryAssessments,
  planRecoveryQuestionSets,
  planRecoveryRevisionPlans,
  planRecoveryScheduling,
} from './backupRecoveryPlanning';

/** Apply prepared rows within the caller-owned atomic write transaction. */
export async function mergeBackupForRecovery(prepared: PreparedBackup): Promise<void> {
  const {
    backup,
    incomingQuestions,
    incomingQuestionSets,
    incomingQuestionSetAttempts,
    notes,
    cards,
    courses,
    courseAssessments,
    storageProjection,
    agentMemories,
    hydratedReviewHistory,
    sessionHistory,
    dedupedAssets,
  } = prepared;
  const existingCourses = new Map((await db.courses.toArray()).map((c) => [c.id, c]));
  const incomingCourses = new Map(courses.map((c) => [c.id, c]));
  if (dedupedAssets.length) await db.assets.bulkPut(dedupedAssets);

  // Merge course-architecture tables: add incoming rows that don't exist locally,
  // preferring the newer record (by createdAt) when both sides have the same id.
  if (courses.length > 0) {
    const mergedCourses: CourseRecord[] = [];
    for (const incoming of courses) {
      const existing = existingCourses.get(incoming.id);
      if (!existing) {
        mergedCourses.push(incoming);
      } else {
        mergedCourses.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.courses.bulkPut(mergedCourses);
  }

  const assessmentIdRemap = new Map<string, string>();
  if (courseAssessments.length > 0) {
    const plan = planRecoveryAssessments(await db.courseAssessments.toArray(), courseAssessments);
    for (const [incomingId, localId] of plan.assessmentIdRemap) {
      assessmentIdRemap.set(incomingId, localId);
    }
    await db.courseAssessments.bulkPut(plan.assessments);
  }

  assertSpecificationAssessmentReferences(
    await db.courses.toArray(),
    await db.courseAssessments.toArray(),
  );

  const localQuestionState = {
    concepts: await db.concepts.toArray(),
    questions: await db.questions.toArray(),
    questionConcepts: await db.questionConcepts.toArray(),
    questionAttempts: await db.questionAttempts.toArray(),
  };
  const mergedQuestionState = mergeQuestionCollections(
    localQuestionState,
    incomingQuestions,
    await db.courses.toArray(),
    [],
  );
  if (mergedQuestionState.concepts.length > 0) {
    await db.concepts.bulkPut(mergedQuestionState.concepts);
  }
  if (mergedQuestionState.questions.length > 0) {
    await db.questions.bulkPut(mergedQuestionState.questions);
  }
  if (mergedQuestionState.questionConcepts.length > 0) {
    await db.questionConcepts.bulkPut(mergedQuestionState.questionConcepts);
  }
  if (mergedQuestionState.questionAttempts.length > 0) {
    await db.questionAttempts.bulkPut(mergedQuestionState.questionAttempts);
  }
  const recoveryTombstones = [...(await db.tombstones.toArray()), ...(backup.tombstones ?? [])];
  const { questionSets, restoredQuestionSetIds } = planRecoveryQuestionSets(
    await db.questionSets.toArray(),
    incomingQuestionSets,
    recoveryTombstones,
    assessmentIdRemap,
  );
  const mergedQuestionSets = questionSets.map((record) =>
    restoredQuestionSetIds.has(record.id)
      ? { ...record, updatedAt: Math.max(record.updatedAt, Date.now()) }
      : record,
  );
  if (mergedQuestionSets.length > 0) await db.questionSets.bulkPut(mergedQuestionSets);
  if (incomingQuestionSetAttempts.length > 0) {
    const local = new Map(
      (await db.questionSetAttempts.toArray()).map((row) => [
        row.id,
        parseQuestionSetAttemptRecord(row),
      ]),
    );
    for (const incoming of incomingQuestionSetAttempts) {
      const existing = local.get(incoming.id);
      if (!existing) {
        await db.questionSetAttempts.put(incoming);
        continue;
      }
      await db.questionSetAttempts.put(mergeQuestionSetAttemptPair(existing, incoming));
    }
  }
  if (restoredQuestionSetIds.size > 0) {
    await db.tombstones.bulkDelete([...restoredQuestionSetIds].map((id) => ['questionSets', id]));
  }

  if (backup.lessons && backup.lessons.length > 0) {
    const existingLessons = new Map((await db.lessons.toArray()).map((l) => [l.id, l]));
    const mergedLessons: Lesson[] = [];
    for (const incoming of backup.lessons) {
      const existing = existingLessons.get(incoming.id);
      if (!existing) {
        mergedLessons.push(incoming);
      } else {
        mergedLessons.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.lessons.bulkPut(mergedLessons);
    assertLessonPrerequisites(await db.lessons.toArray());
  }

  if (notes.length > 0) {
    const existingNotes = new Map((await db.notes.toArray()).map((n) => [n.id, n]));
    const mergedNotes: Note[] = [];
    for (const incoming of notes) {
      const existing = existingNotes.get(incoming.id);
      if (!existing) {
        mergedNotes.push(incoming);
      } else {
        mergedNotes.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.notes.bulkPut(mergedNotes);
  }

  if (backup.lessonCards && backup.lessonCards.length > 0) {
    const existingLessonCards = new Map((await db.lessonCards.toArray()).map((lc) => [lc.id, lc]));
    const mergedLessonCards: LessonCardLink[] = [];
    for (const incoming of backup.lessonCards) {
      const existing = existingLessonCards.get(incoming.id);
      if (!existing) {
        mergedLessonCards.push(incoming);
      } else {
        mergedLessonCards.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.lessonCards.bulkPut(mergedLessonCards);
  }

  if (backup.lessonCardExposures && backup.lessonCardExposures.length > 0) {
    const existingExposures = new Map(
      (await db.lessonCardExposures.toArray()).map((exposure) => [
        `${exposure.lessonId}\0${exposure.cardId}`,
        exposure,
      ]),
    );
    const mergedExposures: LessonCardExposure[] = backup.lessonCardExposures.map((incoming) => {
      const existing = existingExposures.get(`${incoming.lessonId}\0${incoming.cardId}`);
      if (!existing) return incoming;
      return incoming.taughtAt < existing.taughtAt ? incoming : existing;
    });
    await db.lessonCardExposures.bulkPut(mergedExposures);
  }

  if (backup.lessonCompletions && backup.lessonCompletions.length > 0) {
    const existingCompletions = new Map(
      (await db.lessonCompletions.toArray()).map((completion) => [completion.lessonId, completion]),
    );
    const mergedCompletions: LessonCompletion[] = backup.lessonCompletions.map((incoming) => {
      const existing = existingCompletions.get(incoming.lessonId);
      if (!existing) return incoming;
      return incoming.completedAt < existing.completedAt ? incoming : existing;
    });
    await db.lessonCompletions.bulkPut(mergedCompletions);
  }

  if (backup.practiceNodes && backup.practiceNodes.length > 0) {
    const existingPracticeNodes = new Map((await db.practiceNodes.toArray()).map((p) => [p.id, p]));
    const mergedPracticeNodes: PracticeNode[] = [];
    for (const incoming of backup.practiceNodes) {
      const existing = existingPracticeNodes.get(incoming.id);
      if (!existing) {
        mergedPracticeNodes.push(incoming);
      } else if (incoming.type === 'question-set' && existing.type === 'question-set') {
        mergedPracticeNodes.push(updatedRecordWins(incoming, existing) ? incoming : existing);
      } else {
        mergedPracticeNodes.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.practiceNodes.bulkPut(mergedPracticeNodes);
  }

  if (backup.practiceMilestones && backup.practiceMilestones.length > 0) {
    const existingMilestones = new Map(
      (await db.practiceMilestones.toArray()).map((milestone) => [milestone.nodeKey, milestone]),
    );
    const mergedMilestones: PracticeMilestone[] = backup.practiceMilestones.map((incoming) => {
      const existing = existingMilestones.get(incoming.nodeKey);
      if (!existing) return incoming;
      return incoming.updatedAt > existing.updatedAt ? incoming : existing;
    });
    await db.practiceMilestones.bulkPut(mergedMilestones);
  }

  if (backup.sequences && backup.sequences.length > 0) {
    const existingSequences = new Map((await db.sequences.toArray()).map((s) => [s.id, s]));
    const mergedSequences: Sequence[] = [];
    for (const incoming of backup.sequences) {
      const existing = existingSequences.get(incoming.id);
      if (!existing) {
        mergedSequences.push(incoming);
      } else {
        mergedSequences.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.sequences.bulkPut(mergedSequences);
  }

  if (backup.occlusions && backup.occlusions.length > 0) {
    const existingOcclusions = new Map((await db.occlusions.toArray()).map((o) => [o.id, o]));
    const mergedOcclusions: Occlusion[] = [];
    for (const incoming of backup.occlusions) {
      const existing = existingOcclusions.get(incoming.id);
      if (!existing) {
        mergedOcclusions.push(incoming);
      } else {
        mergedOcclusions.push(incoming.createdAt > existing.createdAt ? incoming : existing);
      }
    }
    await db.occlusions.bulkPut(mergedOcclusions);
  }

  if (hydratedReviewHistory.length > 0) {
    const existingReviewHistory = await db.reviewHistory.toArray();
    const collisionState: ReviewHistoryCollisionState = {
      usedIds: new Set(),
      eventOwners: new Map(),
      entryIdentities: new Map(),
    };
    resolveReviewHistoryCollisions(existingReviewHistory, collisionState);
    const resolvedIncoming = resolveReviewHistoryCollisions(hydratedReviewHistory, collisionState);
    const existingIds = new Set(existingReviewHistory.map((entry) => entry.id));
    const missingReviewHistory = resolvedIncoming.filter((entry) => !existingIds.has(entry.id));
    if (missingReviewHistory.length > 0) {
      await addReviewHistoryInBatches(missingReviewHistory);
    }
  }

  if (backup.revisionPlans && backup.revisionPlans.length > 0) {
    const mergedPlans = planRecoveryRevisionPlans(
      await db.revisionPlans.toArray(),
      backup.revisionPlans,
      assessmentIdRemap,
    );
    await db.revisionPlans.bulkPut(mergedPlans);
  }

  const scheduling = planRecoveryScheduling(
    {
      schedulingUnits: await db.schedulingUnits.toArray(),
      coursePerformance: await db.coursePerformance.toArray(),
      schedulingPerformance: await db.schedulingPerformance.toArray(),
    },
    storageProjection,
  );
  if (scheduling.schedulingUnits.length > 0) {
    await db.schedulingUnits.bulkPut(scheduling.schedulingUnits);
  }
  if (scheduling.coursePerformance.length > 0) {
    await db.coursePerformance.bulkPut(scheduling.coursePerformance);
  }
  if (scheduling.schedulingPerformance.length > 0) {
    await db.schedulingPerformance.bulkPut(scheduling.schedulingPerformance);
  }

  // Merge cards (most recent lastReviewed wins, falling back to createdAt).
  const existingCards = new Map((await db.cards.toArray()).map((c) => [c.id, c]));
  const mergedCards: Card[] = [];
  for (const incoming of cards) {
    const existing = existingCards.get(incoming.id);
    if (!existing) {
      mergedCards.push(incoming);
    } else {
      const a = existing.lastReviewed ?? existing.createdAt;
      const b = incoming.lastReviewed ?? incoming.createdAt;
      // On a tie, prefer the local copy so the user's latest edits are not
      // silently overwritten by an older backup.
      mergedCards.push(b > a ? incoming : existing);
    }
  }
  await db.cards.bulkPut(projectCardsForStorage(mergedCards));

  // Merge performance: prefer the profile whose deck has been studied most
  // recently (lastInteractedAt), so a local deck reset (totalCorrectReviews = 0)
  // is not overwritten by a stale backup with high review counts.
  const existingPerf = new Map((await db.userPerformance.toArray()).map((p) => [p.deckId, p]));
  const mergedPerf: UserPerformance[] = [];
  for (const incoming of backup.userPerformance) {
    const existing = existingPerf.get(incoming.deckId);
    if (!existing) {
      mergedPerf.push(incoming);
    } else {
      const course = existingCourses.get(incoming.deckId);
      const localInteracted = course?.lastInteractedAt ?? course?.createdAt ?? 0;
      const remoteCourse = incomingCourses.get(incoming.deckId);
      const remoteInteracted = remoteCourse?.lastInteractedAt ?? remoteCourse?.createdAt ?? 0;
      // Prefer whichever side has the more recent deck interaction.
      mergedPerf.push(remoteInteracted > localInteracted ? incoming : existing);
    }
  }
  await db.userPerformance.bulkPut(mergedPerf);

  // Append session history that we do not already have.
  const incomingEventIds = sessionHistory.flatMap((entry) =>
    entry.eventId ? [entry.eventId] : [],
  );
  const incomingLegacyTimestamps = sessionHistory.flatMap((entry) =>
    entry.eventId ? [] : [entry.timestamp],
  );
  const [existingEventRows, existingLegacyRows] = await Promise.all([
    incomingEventIds.length > 0
      ? db.sessionHistory.where('eventId').anyOf(incomingEventIds).toArray()
      : [],
    incomingLegacyTimestamps.length > 0
      ? db.sessionHistory.where('timestamp').anyOf(incomingLegacyTimestamps).toArray()
      : [],
  ]);
  const existingKeys = new Set(
    [...existingEventRows, ...existingLegacyRows].map((entry) =>
      entry.eventId ? `event:${entry.eventId}` : `legacy:${entry.timestamp}:${entry.deckId}`,
    ),
  );
  const toAdd = sessionHistory.flatMap((entry) => {
    const key = entry.eventId
      ? `event:${entry.eventId}`
      : `legacy:${entry.timestamp}:${entry.deckId}`;
    if (existingKeys.has(key)) return [];
    existingKeys.add(key);
    const rest = { ...entry };
    delete rest.id;
    return [rest as SessionHistoryEntry];
  });
  if (toAdd.length) await db.sessionHistory.bulkAdd(toAdd);

  // Store incoming tombstones. Do not apply them as deletes — that is P4.
  if (backup.tombstones && backup.tombstones.length > 0) {
    const existingTombstones = await db.tombstones.toArray();
    const byKey = new Map(existingTombstones.map((row) => [`${row.table}:${row.recordId}`, row]));
    const merged: Tombstone[] = [];
    for (const incoming of backup.tombstones) {
      if (incoming.table === 'questionSets' && restoredQuestionSetIds.has(incoming.recordId)) {
        continue;
      }
      const key = `${incoming.table}:${incoming.recordId}`;
      const existing = byKey.get(key);
      if (!existing || incoming.deletedAt > existing.deletedAt) {
        byKey.set(key, incoming);
      }
    }
    for (const row of byKey.values()) merged.push(row);
    await db.tombstones.bulkPut(merged);
  }

  await mergeRecoveryLineage(backup.lineageIdMappings ?? [], backup.pendingMergeReviews ?? []);

  if (agentMemories.length > 0) {
    const local = new Map((await db.agentMemories.toArray()).map((memory) => [memory.id, memory]));
    const incomingById = new Map<string, AgentMemory>();
    for (const incoming of agentMemories) {
      const selected = incomingById.get(incoming.id);
      if (selected && selected.courseId !== incoming.courseId) {
        throw new Error('A learner memory cannot move between global and Course scope.');
      }
      if (!selected || updatedRecordWins(incoming, selected))
        incomingById.set(incoming.id, incoming);
    }
    const merged: AgentMemory[] = [];
    for (const incoming of incomingById.values()) {
      if (incoming.courseId !== null && !(await db.courses.get(incoming.courseId))) continue;
      const existing = local.get(incoming.id);
      if (existing && existing.courseId !== incoming.courseId) {
        throw new Error('A learner memory cannot move between global and Course scope.');
      }
      if (!existing || updatedRecordWins(incoming, existing)) merged.push(incoming);
    }
    if (merged.length > 0) await db.agentMemories.bulkPut(merged);
  }
  assertQuestionSetPracticeNodeReferences(
    await db.practiceNodes.toArray(),
    await db.courses.toArray(),
    await db.lessons.toArray(),
    await db.questionSets.toArray(),
    await db.practiceMilestones.toArray(),
  );
}

async function mergeRecoveryLineage(
  mappings: LineageIdMapping[],
  reviews: PendingMergeReview[],
): Promise<void> {
  if (mappings.length === 0 && reviews.length === 0) return;

  // An older backup cannot restore tracking for a course that was detached locally.
  const courseIds = [...new Set([...mappings, ...reviews].map((row) => row.courseId))];
  const courses = await db.courses.bulkGet(courseIds);
  const lineageByCourse = new Map(
    courses.map((course) => [course?.id, course?.distributedCopy?.lineageId]),
  );
  const incomingMappings = mappings.filter((row) => lineageByCourse.get(row.courseId) === row.id);
  const localMappings = await db.lineageIdMappings.toArray();
  const mergedMappings = mergeLineageMappings(localMappings, incomingMappings);
  const incomingMappingIds = new Set(incomingMappings.map((row) => row.id));
  if (incomingMappingIds.size > 0) {
    await db.lineageIdMappings.bulkPut(
      mergedMappings.filter((row) => incomingMappingIds.has(row.id)),
    );
  }

  const mappingOwners = new Map(mergedMappings.map((row) => [row.id, row.courseId]));
  const hasReviewLineage = (row: PendingMergeReview) =>
    lineageByCourse.get(row.courseId) === row.lineageId &&
    mappingOwners.get(row.lineageId) === row.courseId;
  const incomingReviews = reviews.filter(hasReviewLineage);
  if (incomingReviews.length === 0) return;

  const localReviews = await db.pendingMergeReviews.toArray();
  const reviewOwners = new Map(localReviews.map((row) => [row.id, row.courseId]));
  for (const row of incomingReviews) {
    const owner = reviewOwners.get(row.id);
    if (owner !== undefined && owner !== row.courseId) {
      throw new Error(`Pending review ${row.id} belongs to conflicting Courses.`);
    }
    reviewOwners.set(row.id, row.courseId);
  }
  const reviewCourses = new Set(incomingReviews.map((row) => row.courseId));
  const affectedLocal = localReviews.filter((row) => reviewCourses.has(row.courseId));
  const mergedReviews = newestWins(
    affectedLocal.filter(hasReviewLineage),
    incomingReviews,
    (row) => row.courseId,
    (row) => row.createdAt,
  );
  const retained = new Set(mergedReviews.map((row) => row.id));
  await db.pendingMergeReviews.bulkDelete(
    affectedLocal.filter((row) => !retained.has(row.id)).map((row) => row.id),
  );
  await db.pendingMergeReviews.bulkPut(mergedReviews);
}

function updatedRecordWins(
  candidate: { updatedAt: number },
  current: { updatedAt: number },
): boolean {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return canonicalJson(candidate) > canonicalJson(current);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}
