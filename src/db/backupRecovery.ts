import { assertLessonPrerequisites } from './lessonPrerequisites';
import { db } from './schema';
import { addReviewHistoryInBatches } from './addReviewHistoryInBatches';
import type {
  Card,
  CourseAssessment,
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
  RevisionPlan,
  SchedulingUnitRecord,
  CoursePerformance,
  SchedulingPerformance,
  Tombstone,
  AgentMemory,
} from './types';
import {
  projectCardsForStorage,
  resolveReviewHistoryCollisions,
  type ReviewHistoryCollisionState,
} from './reviewHistory';
import { mergeRevisionPlans } from '../course/revisionPlan';
import { mergeQuestionCollections } from '../questions/merge';
import { parseQuestionSetAttemptRecord } from '../questions/questionSetAttemptCodec';
import { mergeQuestionSetAttemptPair } from '../questions/questionSetAttemptMerge';
import { mergeQuestionSetRecords } from '../questions/questionSetMerge';
import { assertQuestionSetPracticeNodeReferences } from './questionSetPracticeNode';
import type { PreparedBackup } from './backupPreparation';

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
  const restoredQuestionSetIds = new Set<string>();
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
    const localAssessments = await db.courseAssessments.toArray();
    const existingCourseAssessments = new Map(
      localAssessments.map((assessment) => [assessment.id, assessment]),
    );
    const existingFinalsByCourse = new Map(
      localAssessments
        .filter((assessment) => assessment.kind === 'final')
        .map((assessment) => [assessment.courseId, assessment]),
    );
    const mergedCourseAssessments: CourseAssessment[] = [];
    for (const incoming of courseAssessments) {
      const existing =
        incoming.kind === 'final'
          ? existingFinalsByCourse.get(incoming.courseId)
          : existingCourseAssessments.get(incoming.id);
      if (!existing) {
        mergedCourseAssessments.push(incoming);
      } else {
        const newer = incoming.createdAt > existing.createdAt ? incoming : existing;
        if (incoming.kind === 'final') assessmentIdRemap.set(incoming.id, existing.id);
        mergedCourseAssessments.push(
          incoming.kind === 'final' ? { ...newer, id: existing.id } : newer,
        );
      }
    }
    await db.courseAssessments.bulkPut(mergedCourseAssessments);
  }

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
  const deletedAtBySet = new Map<string, number>();
  for (const row of [...(await db.tombstones.toArray()), ...(backup.tombstones ?? [])]) {
    if (row.table !== 'questionSets') continue;
    deletedAtBySet.set(
      row.recordId,
      Math.max(deletedAtBySet.get(row.recordId) ?? -Infinity, row.deletedAt),
    );
  }
  const mergedQuestionSets = mergeQuestionSetRecords(
    await db.questionSets.toArray(),
    // Final Assessments merge by Course identity while retaining the local id.
    // Keep authored set assignments pointing at that retained Assessment too.
    incomingQuestionSets.map((record) => ({
      ...record,
      assessmentIds: [
        ...new Set(record.assessmentIds.map((id) => assessmentIdRemap.get(id) ?? id)),
      ],
    })),
    // Recovery merge deliberately restores rows and does not apply deletion receipts.
    // Peer merge applies them in mergeSnapshots instead.
    [],
  ).map((record) => {
    const deletedAt = deletedAtBySet.get(record.id);
    if (deletedAt === undefined) return record;
    if (deletedAt >= Number.MAX_SAFE_INTEGER) {
      throw new Error('A Question Set deletion timestamp cannot be restored safely.');
    }
    restoredQuestionSetIds.add(record.id);
    return { ...record, updatedAt: Math.max(record.updatedAt, deletedAt + 1, Date.now()) };
  });
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
    const existingPlans = new Map(
      (await db.revisionPlans.toArray()).map((plan) => [plan.assessmentId, plan]),
    );
    const incomingPlans = new Map<string, RevisionPlan>();
    for (const raw of backup.revisionPlans) {
      const assessmentId = assessmentIdRemap.get(raw.assessmentId) ?? raw.assessmentId;
      const incoming = { ...raw, assessmentId };
      const duplicate = incomingPlans.get(assessmentId);
      if (!duplicate || incoming.updatedAt > duplicate.updatedAt) {
        incomingPlans.set(assessmentId, incoming);
      }
    }
    const mergedPlans: RevisionPlan[] = [...incomingPlans.values()].map((incoming) => {
      const existing = existingPlans.get(incoming.assessmentId);
      return existing ? mergeRevisionPlans(existing, incoming) : incoming;
    });
    await db.revisionPlans.bulkPut(mergedPlans);
  }

  // Merge target projections by the source unit's interaction timestamp. A stale
  // backup must never regress scheduling controls or pacing statistics that were
  // changed locally after the backup was created.
  const existingSchedulingUnits = new Map(
    (await db.schedulingUnits.toArray()).map((unit) => [unit.id, unit]),
  );
  const mergedSchedulingUnits: SchedulingUnitRecord[] = storageProjection.schedulingUnits.map(
    (incoming) => {
      const existing = existingSchedulingUnits.get(incoming.id);
      if (!existing) return incoming;
      const incomingAt = incoming.lastInteractedAt ?? incoming.createdAt ?? 0;
      const existingAt = existing.lastInteractedAt ?? existing.createdAt ?? 0;
      return incomingAt > existingAt ? incoming : existing;
    },
  );
  const mergedUnitsById = new Map(mergedSchedulingUnits.map((unit) => [unit.id, unit]));
  const existingCoursePerformance = new Map(
    (await db.coursePerformance.toArray()).map((row) => [row.courseId, row]),
  );
  const mergedCoursePerformance: CoursePerformance[] = storageProjection.coursePerformance.map(
    (incoming) => {
      const existing = existingCoursePerformance.get(incoming.courseId);
      if (!existing) return incoming;
      const incomingUnit = mergedUnitsById.get(incoming.courseId);
      const existingUnit = existingSchedulingUnits.get(incoming.courseId);
      const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
      const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
      return incomingAt > existingAt ? incoming : existing;
    },
  );
  const existingSchedulingPerformance = new Map(
    (await db.schedulingPerformance.toArray()).map((row) => [row.schedulingUnitId, row]),
  );
  const mergedSchedulingPerformance: SchedulingPerformance[] =
    storageProjection.schedulingPerformance.map((incoming) => {
      const existing = existingSchedulingPerformance.get(incoming.schedulingUnitId);
      if (!existing) return incoming;
      const incomingUnit = mergedUnitsById.get(incoming.schedulingUnitId);
      const existingUnit = existingSchedulingUnits.get(incoming.schedulingUnitId);
      const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
      const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
      return incomingAt > existingAt ? incoming : existing;
    });
  if (mergedSchedulingUnits.length > 0) {
    await db.schedulingUnits.bulkPut(mergedSchedulingUnits);
  }
  if (mergedCoursePerformance.length > 0) {
    await db.coursePerformance.bulkPut(mergedCoursePerformance);
  }
  if (mergedSchedulingPerformance.length > 0) {
    await db.schedulingPerformance.bulkPut(mergedSchedulingPerformance);
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
