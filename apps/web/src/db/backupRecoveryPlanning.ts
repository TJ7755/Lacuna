import type {
  CourseAssessment,
  CoursePerformance,
  RevisionPlan,
  SchedulingPerformance,
  SchedulingUnitRecord,
  Tombstone,
} from '@lacuna/core/db/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { mergeRevisionPlans } from '../course/revisionPlan';
import { mergeQuestionSetRecords } from '../questions/questionSetMerge';
import type { BackupSchedulingProjection } from './backupSchedulingProjection';

/** Final Assessments retain their local identity even when the backup uses another id. */
export function planRecoveryAssessments(local: CourseAssessment[], incoming: CourseAssessment[]) {
  const byId = new Map(local.map((assessment) => [assessment.id, assessment]));
  const finalsByCourse = new Map(
    local
      .filter((assessment) => assessment.kind === 'final')
      .map((assessment) => [assessment.courseId, assessment]),
  );
  const assessmentIdRemap = new Map<string, string>();
  const assessments = incoming.map((assessment) => {
    const existing =
      assessment.kind === 'final'
        ? finalsByCourse.get(assessment.courseId)
        : byId.get(assessment.id);
    if (!existing) return assessment;
    const newer = assessment.createdAt > existing.createdAt ? assessment : existing;
    if (assessment.kind !== 'final') return newer;
    assessmentIdRemap.set(assessment.id, existing.id);
    return { ...newer, id: existing.id };
  });
  return { assessments, assessmentIdRemap };
}

/** Recovery restores rows rather than applying peer-merge deletion receipts. */
export function planRecoveryQuestionSets(
  local: QuestionSetRecord[],
  incoming: QuestionSetRecord[],
  tombstones: Tombstone[],
  assessmentIdRemap: ReadonlyMap<string, string>,
) {
  const deletedAtBySet = new Map<string, number>();
  for (const row of tombstones) {
    if (row.table !== 'questionSets') continue;
    deletedAtBySet.set(
      row.recordId,
      Math.max(deletedAtBySet.get(row.recordId) ?? -Infinity, row.deletedAt),
    );
  }
  const restoredQuestionSetIds = new Set<string>();
  const questionSets = mergeQuestionSetRecords(
    local,
    incoming.map((record) => ({
      ...record,
      assessmentIds: [
        ...new Set(record.assessmentIds.map((id) => assessmentIdRemap.get(id) ?? id)),
      ],
    })),
    [],
  ).map((record) => {
    const deletedAt = deletedAtBySet.get(record.id);
    if (deletedAt === undefined) return record;
    if (deletedAt >= Number.MAX_SAFE_INTEGER) {
      throw new Error('A Question Set deletion timestamp cannot be restored safely.');
    }
    restoredQuestionSetIds.add(record.id);
    return { ...record, updatedAt: Math.max(record.updatedAt, deletedAt + 1) };
  });
  return { questionSets, restoredQuestionSetIds };
}

/** Remap and collapse incoming plans before merging against the retained local Assessment. */
export function planRecoveryRevisionPlans(
  local: RevisionPlan[],
  incoming: RevisionPlan[],
  assessmentIdRemap: ReadonlyMap<string, string>,
): RevisionPlan[] {
  const existingPlans = new Map(local.map((plan) => [plan.assessmentId, plan]));
  const incomingPlans = new Map<string, RevisionPlan>();
  for (const raw of incoming) {
    const assessmentId = assessmentIdRemap.get(raw.assessmentId) ?? raw.assessmentId;
    const plan = { ...raw, assessmentId };
    const duplicate = incomingPlans.get(assessmentId);
    if (!duplicate || plan.updatedAt > duplicate.updatedAt) incomingPlans.set(assessmentId, plan);
  }
  return [...incomingPlans.values()].map((plan) => {
    const existing = existingPlans.get(plan.assessmentId);
    return existing ? mergeRevisionPlans(existing, plan) : plan;
  });
}

type RecoveryScheduling = Pick<
  BackupSchedulingProjection,
  'schedulingUnits' | 'coursePerformance' | 'schedulingPerformance'
>;

/** A stale backup must not regress locally changed scheduling controls or pacing statistics. */
export function planRecoveryScheduling(local: RecoveryScheduling, incoming: RecoveryScheduling) {
  const existingSchedulingUnits = new Map(local.schedulingUnits.map((unit) => [unit.id, unit]));
  const schedulingUnits: SchedulingUnitRecord[] = incoming.schedulingUnits.map((unit) => {
    const existing = existingSchedulingUnits.get(unit.id);
    if (!existing) return unit;
    const incomingAt = unit.lastInteractedAt ?? unit.createdAt ?? 0;
    const existingAt = existing.lastInteractedAt ?? existing.createdAt ?? 0;
    return incomingAt > existingAt ? unit : existing;
  });
  const mergedUnitsById = new Map(schedulingUnits.map((unit) => [unit.id, unit]));
  const existingCoursePerformance = new Map(
    local.coursePerformance.map((row) => [row.courseId, row]),
  );
  const coursePerformance: CoursePerformance[] = incoming.coursePerformance.map((row) => {
    const existing = existingCoursePerformance.get(row.courseId);
    if (!existing) return row;
    const incomingUnit = mergedUnitsById.get(row.courseId);
    const existingUnit = existingSchedulingUnits.get(row.courseId);
    const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
    const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
    return incomingAt > existingAt ? row : existing;
  });
  const existingSchedulingPerformance = new Map(
    local.schedulingPerformance.map((row) => [row.schedulingUnitId, row]),
  );
  const schedulingPerformance: SchedulingPerformance[] = incoming.schedulingPerformance.map(
    (row) => {
      const existing = existingSchedulingPerformance.get(row.schedulingUnitId);
      if (!existing) return row;
      const incomingUnit = mergedUnitsById.get(row.schedulingUnitId);
      const existingUnit = existingSchedulingUnits.get(row.schedulingUnitId);
      const incomingAt = incomingUnit?.lastInteractedAt ?? incomingUnit?.createdAt ?? 0;
      const existingAt = existingUnit?.lastInteractedAt ?? existingUnit?.createdAt ?? 0;
      return incomingAt > existingAt ? row : existing;
    },
  );
  return { schedulingUnits, coursePerformance, schedulingPerformance };
}
