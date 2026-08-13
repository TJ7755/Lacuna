import { courseToRecord } from './assessmentMigration';
import { migrateDeckRecord } from './migrations';
import { buildDomainStorageMigration } from './storageMigration';
import type {
  BackupFile,
  Card,
  Course,
  CourseAssessment,
  CourseRecord,
  LegacyDeckRecord,
  Lesson,
  SchedulingPerformance,
  SchedulingUnitRecord,
  CoursePerformance,
} from './types';

export interface LegacyImportReport {
  discardedFolderNames: string[];
}

export interface LegacyBackupAdaptation {
  decks: LegacyDeckRecord[];
  cards: Card[];
  courses: CourseRecord[];
  courseAssessments: CourseAssessment[];
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  schedulingUnitByCardId: Map<string, string>;
  schedulingUnitByDeckId: Map<string, string>;
  report: LegacyImportReport;
}

interface AdaptLegacyBackupOptions {
  courses: CourseRecord[];
  lessons: Lesson[];
  courseAssessments: CourseAssessment[];
  cards: Card[];
  generateId: () => string;
}

const COURSE_PATH_DEFAULTS = {
  unlockMode: 'open',
  autoPractice: true,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 2,
} as const;

function courseFromStandaloneDeck(deck: LegacyDeckRecord, id: string): Course {
  return {
    id,
    name: deck.name,
    description: '',
    createdAt: deck.createdAt,
    examDate: deck.examDate,
    ...(deck.timeZone ? { timeZone: deck.timeZone } : {}),
    ...(deck.examDatePromptDismissed !== undefined
      ? { examDatePromptDismissed: deck.examDatePromptDismissed }
      : {}),
    fsrsVersion: deck.fsrsVersion,
    fsrsParameters: deck.fsrsParameters,
    examObjective: deck.examObjective,
    ...(deck.newCardsPerDay !== undefined ? { newCardsPerDay: deck.newCardsPerDay } : {}),
    ...(deck.maxReviewsPerDay !== undefined ? { maxReviewsPerDay: deck.maxReviewsPerDay } : {}),
    ...(deck.archived !== undefined ? { archived: deck.archived } : {}),
    ...(deck.autoOptimise !== undefined ? { autoOptimise: deck.autoOptimise } : {}),
    ...(deck.leechThreshold !== undefined ? { leechThreshold: deck.leechThreshold } : {}),
    ...(deck.leechAction !== undefined ? { leechAction: deck.leechAction } : {}),
    ...(deck.dailyReviewGoal !== undefined ? { dailyReviewGoal: deck.dailyReviewGoal } : {}),
    ...(deck.sessionTimeLimitMinutes !== undefined
      ? { sessionTimeLimitMinutes: deck.sessionTimeLimitMinutes }
      : {}),
    ...(deck.lastInteractedAt !== undefined ? { lastInteractedAt: deck.lastInteractedAt } : {}),
    ...(deck.colour ? { colour: deck.colour } : {}),
    ...COURSE_PATH_DEFAULTS,
  };
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
 * Convert Deck-bearing backup payloads at the import boundary. The scheduling
 * projection always comes from buildDomainStorageMigration, matching the v21
 * schema upgrade. Complete v21 target rows override the equivalent projection so
 * their already-migrated values survive byte-for-byte.
 */
export function adaptLegacyBackup(
  backup: BackupFile,
  options: AdaptLegacyBackupOptions,
): LegacyBackupAdaptation {
  const decks = (backup.decks ?? []).map(migrateDeckRecord);
  const courses = [...options.courses];
  const courseAssessments = [...options.courseAssessments];
  const courseIds = new Set(courses.map((course) => course.id));
  const lessonsById = new Map(options.lessons.map((lesson) => [lesson.id, lesson]));
  const cardsByDeckId = new Map<string, Card[]>();
  for (const card of options.cards) {
    const legacyDeckId = card.deckId ?? card.schedulingUnitId;
    if (!legacyDeckId) continue;
    const deckCards = cardsByDeckId.get(legacyDeckId) ?? [];
    deckCards.push(card);
    cardsByDeckId.set(legacyDeckId, deckCards);
  }

  const normalisedDecks = decks.map((deck) => {
    if (deck.backingCourseId && courseIds.has(deck.backingCourseId)) return deck;

    const deckCards = cardsByDeckId.get(deck.id) ?? [];
    const cardCourseIds = new Set(
      deckCards
        .map((card) => card.courseId)
        .filter((courseId): courseId is string => !!courseId && courseIds.has(courseId)),
    );
    if (cardCourseIds.size === 1) {
      const [courseId] = cardCourseIds;
      const lessonIds = new Set(
        deckCards
          .map((card) => card.primaryLessonId)
          .filter(
            (lessonId): lessonId is string =>
              !!lessonId && lessonsById.get(lessonId)?.courseId === courseId,
          ),
      );
      return {
        ...deck,
        backingCourseId: courseId,
        ...(lessonIds.size === 1 ? { backingLessonId: [...lessonIds][0] } : {}),
      };
    }

    let courseId = deck.id;
    while (courseIds.has(courseId)) courseId = options.generateId();
    const course = courseFromStandaloneDeck(deck, courseId);
    courses.push(courseToRecord(course));
    courseIds.add(courseId);
    courseAssessments.push({
      id: options.generateId(),
      courseId,
      name: 'Final exam',
      kind: 'final',
      examDate: deck.examDate,
      ...(deck.timeZone ? { timeZone: deck.timeZone } : {}),
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: deck.createdAt,
    });
    return { ...deck, backingCourseId: courseId };
  });

  const projection = buildDomainStorageMigration(
    courses,
    options.lessons,
    courseAssessments,
    normalisedDecks,
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
    decks: normalisedDecks,
    cards,
    courses,
    courseAssessments,
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
    report: {
      discardedFolderNames: [...(backup.folders ?? [])]
        .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
        .map((folder) => folder.name),
    },
  };
}
