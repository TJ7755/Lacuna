import type {
  BackupFile,
  Card,
  CourseAssessment,
  CourseRecord,
  Lesson,
  SchedulingPerformance,
  SchedulingUnitRecord,
  CoursePerformance,
} from '@lacuna/core/db/types';

export interface BackupSchedulingProjection {
  cards: Card[];
  courses: CourseRecord[];
  courseAssessments: CourseAssessment[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  schedulingUnitByCardId: Map<string, string>;
  schedulingUnitByDeckId: Map<string, string>;
}

interface BackupSchedulingOptions {
  courses: CourseRecord[];
  lessons: Lesson[];
  courseAssessments: CourseAssessment[];
  cards: Card[];
}

export function projectBackupScheduling(
  backup: BackupFile,
  options: BackupSchedulingOptions,
): BackupSchedulingProjection {
  const cards = options.cards;

  return {
    cards,
    courses: options.courses,
    courseAssessments: options.courseAssessments,
    schedulingUnits: backup.schedulingUnits ?? [],
    coursePerformance: backup.coursePerformance ?? [],
    schedulingPerformance: backup.schedulingPerformance ?? [],
    schedulingUnitByCardId: new Map(
      cards.flatMap((card) =>
        card.schedulingUnitId ? [[card.id, card.schedulingUnitId] as const] : [],
      ),
    ),
    schedulingUnitByDeckId: new Map<string, string>(),
  };
}
