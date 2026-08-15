import { buildDomainStorageMigration } from './storageMigration';
import type {
  BackupFile,
  Card,
  CourseAssessment,
  CourseRecord,
  Lesson,
  SchedulingPerformance,
  SchedulingUnitRecord,
  CoursePerformance,
} from './types';

export interface LegacyBackupAdaptation {
  cards: Card[];
  courses: CourseRecord[];
  courseAssessments: CourseAssessment[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  schedulingUnitByCardId: Map<string, string>;
  schedulingUnitByDeckId: Map<string, string>;
}

interface AdaptLegacyBackupOptions {
  courses: CourseRecord[];
  lessons: Lesson[];
  courseAssessments: CourseAssessment[];
  cards: Card[];
}

function preferPayloadRows<T, K extends string>(
  projected: T[],
  payload: T[] | undefined,
  key: (row: T) => K,
): T[] {
  if (!payload) return projected;
  const rows = new Map(projected.map((row) => [key(row), row]));
  for (const row of payload) {
    const rowKey = key(row);
    rows.set(rowKey, { ...rows.get(rowKey), ...row });
  }
  return [...rows.values()];
}

/**
 * Rebuild or merge the scheduling projection for a current-shaped backup.
 * Deck-bearing files are refused before this runs.
 */
export function adaptLegacyBackup(
  backup: BackupFile,
  options: AdaptLegacyBackupOptions,
): LegacyBackupAdaptation {
  const projection = buildDomainStorageMigration(
    options.courses,
    options.lessons,
    options.courseAssessments,
    [],
    options.cards,
    backup.userPerformance,
  );
  const hasCompleteTargetProjection =
    backup.schedulingUnits !== undefined &&
    backup.coursePerformance !== undefined &&
    backup.schedulingPerformance !== undefined &&
    backup.schedulingUnits.every((unit) => typeof unit.createdAt === 'number');
  const projectedUnits = preferPayloadRows(
    projection.schedulingUnits,
    hasCompleteTargetProjection
      ? backup.schedulingUnits?.filter((unit) => unit.kind !== 'legacy-deck')
      : undefined,
    (unit) => unit.id,
  );
  const unitById = new Map(projectedUnits.map((unit) => [unit.id, unit]));
  const cards = options.cards.map((card) => {
    const projectedUnitId = projection.schedulingUnitByCardId.get(card.id);
    const schedulingUnitId =
      card.schedulingUnitId && unitById.has(card.schedulingUnitId)
        ? card.schedulingUnitId
        : projectedUnitId;
    const unit = schedulingUnitId ? unitById.get(schedulingUnitId) : undefined;
    return {
      ...card,
      ...(schedulingUnitId ? { schedulingUnitId } : {}),
      ...(unit?.courseId ? { courseId: unit.courseId } : {}),
      ...(unit?.lessonId ? { primaryLessonId: unit.lessonId } : {}),
    };
  });

  return {
    cards,
    courses: options.courses,
    courseAssessments: options.courseAssessments,
    schedulingUnits: projectedUnits,
    coursePerformance: preferPayloadRows(
      projection.coursePerformance,
      hasCompleteTargetProjection ? backup.coursePerformance : undefined,
      (row) => row.courseId,
    ),
    schedulingPerformance: preferPayloadRows(
      projection.schedulingPerformance,
      hasCompleteTargetProjection ? backup.schedulingPerformance : undefined,
      (row) => row.schedulingUnitId,
    ),
    schedulingUnitByCardId: new Map(
      cards.flatMap((card) =>
        card.schedulingUnitId ? [[card.id, card.schedulingUnitId] as const] : [],
      ),
    ),
    schedulingUnitByDeckId: projection.schedulingUnitByDeckId,
  };
}
