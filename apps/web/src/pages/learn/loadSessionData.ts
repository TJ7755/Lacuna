import { db } from '../../db/schema';
import { performanceForReviewUnits } from '../../db/backingDecks';
import { dailyReviewCounts } from '../../db/reviewHistoryRead';
import { listNotes } from '../../db/noteRepository';
import { linesModeSequencesByCard } from '../../db/linesModeCards';
import { occlusionDataByCard, type OcclusionCardData } from '../../db/occlusionStudy';
import { filterSessionCardPool, type CardFilter } from '../../db/search';
import type { Sequence, UserPerformance, SchedulerConfig } from '../../db/types';
import { emptyPerformance } from '../../fsrs/grading';
import {
  makeSessionContext,
  sessionProgress,
  sessionCompletionProgress,
  sessionServePool,
  sessionComplete,
} from '../../fsrs/session';
import { progressHeading } from '../../fsrs/objective';
import { startOfDay } from '../../utils/datetime';
import type { SessionSummary } from '../../course/sessionSummary';
import { FILTER_LABELS, type LearnModeType, type LessonNotesScreen } from './types';
import type { LoadedSessionSource } from './loadSessionSource';
import { shuffledSimpleQueue } from './recitation/recitationFlow';
import { prepareSimpleSessionQueue } from './sessionPool';
import type { SimpleSessionScope } from './simpleSessionPersistence';

interface SessionDataRequest {
  source: LoadedSessionSource;
  tagFilter: string | null;
  filterParams: CardFilter[];
  lessonId: string | undefined;
  plannedRevision: boolean;
  isSimpleMode: boolean;
  isGlobal: boolean;
  mode: LearnModeType;
  simpleSessionScope: SimpleSessionScope;
  markLoad: (stage: string) => void;
}

type SessionEntry =
  | { type: 'notes'; screen: LessonNotesScreen }
  | { type: 'summary'; summary: SessionSummary }
  | { type: 'serve' };

/** Load metadata and derive the entry screen before publishing the new session. */
export async function loadSessionData(request: SessionDataRequest) {
  const {
    source,
    tagFilter,
    filterParams,
    lessonId,
    plannedRevision,
    isSimpleMode,
    isGlobal,
    mode,
    simpleSessionScope,
  } = request;
  const { units, sessionUnits, firstStudyLessonId, firstStudyLessonName } = source;
  let cards = filterSessionCardPool(source.cards, { tag: tagFilter, filters: filterParams });
  if (isSimpleMode) {
    const now = Date.now();
    cards = cards.filter(
      (card) => !card.suspended && !(card.buriedUntil && card.buriedUntil > now),
    );
  }
  const perfs = await performanceForReviewUnits(
    units.map((unit) => unit.id),
    source.reviewKind,
  );
  const performance = new Map<string, UserPerformance>();
  units.forEach((unit, index) =>
    performance.set(unit.id, perfs[index] ?? emptyPerformance(unit.id)),
  );
  const schedulingUnits = new Map(units.map((unit) => [unit.id, unit]));
  const schedulingConfig:
    (SchedulerConfig & { dailyReviewGoal?: number; sessionTimeLimitMinutes?: number }) | null =
    sessionUnits.length === 1 && 'config' in sessionUnits[0] ? sessionUnits[0].config : null;
  const context = makeSessionContext(
    sessionUnits,
    !plannedRevision && !isSimpleMode && filterParams.includes('due') ? 'due' : 'objective',
    plannedRevision || isSimpleMode ? undefined : cards,
  );
  request.markLoad('context-ready');
  const answerLessonIds = [
    ...new Set(cards.flatMap((card) => (card.primaryLessonId ? [card.primaryLessonId] : []))),
  ];
  if (lessonId && !answerLessonIds.includes(lessonId)) answerLessonIds.push(lessonId);
  const answerLessons = await db.lessons.bulkGet(answerLessonIds);
  const answerModeLessons = new Map(
    answerLessons.flatMap((lesson) => (lesson ? [[lesson.id, lesson] as const] : [])),
  );
  let linesMode = new Map<string, Sequence>();
  let occlusions = new Map<string, OcclusionCardData>();
  try {
    linesMode = await linesModeSequencesByCard(cards);
  } catch {
    // Optional prompt metadata must not prevent the grading path from loading.
  }
  try {
    occlusions = await occlusionDataByCard(cards);
  } catch {
    // Occlusion cards retain their plain-text fallback when metadata cannot load.
  }
  request.markLoad('metadata-ready');
  const initialProgress = sessionProgress(cards, context);
  const serveableCards = plannedRevision || isSimpleMode ? cards : sessionServePool(cards, context);
  const schedulerProgress = sessionCompletionProgress(cards, context, new Map());
  const reviewNow = isSimpleMode ? 0 : Date.now();
  const reviewsDayStart = isSimpleMode ? 0 : startOfDay(reviewNow);
  const reviewsByDeck = isSimpleMode
    ? new Map<string, number>()
    : await dailyReviewCounts(source.reviewKind, reviewNow);
  request.markLoad('progress-ready');
  const simple = isSimpleMode
    ? prepareSimpleSessionQueue(cards, simpleSessionScope, (pool) =>
        shuffledSimpleQueue(pool, linesMode),
      )
    : null;
  const notes =
    firstStudyLessonId && firstStudyLessonName ? await listNotes(firstStudyLessonId) : null;
  let entry: SessionEntry;
  let progressBefore = initialProgress;
  if (notes && firstStudyLessonName) {
    entry =
      notes.length === 0 && cards.length > 0
        ? { type: 'serve' }
        : { type: 'notes', screen: { lessonName: firstStudyLessonName, notes } };
    // Lesson entry precedes the initial progress snapshot, as it did in the hook.
    progressBefore = 0;
  } else if (units.length === 0 || serveableCards.length === 0) {
    const isFiltered = filterParams.length > 0 || tagFilter !== null;
    const practiceAlreadySecured =
      !isFiltered && (source.practiceSession?.scopeCards.length ?? 0) > 0 && cards.length === 0;
    const reportProgress = isFiltered ? 0 : initialProgress;
    progressBefore = reportProgress;
    const filterLabel = [
      ...(tagFilter ? [`tag "${tagFilter}"`] : []),
      ...filterParams.map((filter) => FILTER_LABELS[filter] ?? filter),
    ].join(' and ');
    entry = {
      type: 'summary',
      summary: {
        events: [],
        masteryBefore: reportProgress,
        masteryAfter: reportProgress,
        objectiveLabel: isFiltered
          ? cards.length > 0
            ? `No eligible cards matching ${filterLabel} to study`
            : `No cards matching ${filterLabel} to study`
          : cards.length > 0
            ? 'No cards are currently eligible to study'
            : !isGlobal
              ? progressHeading(units[0])
              : 'Predicted readiness across all courses',
        focusFraction: 1,
        reachedGoal: practiceAlreadySecured,
        limitReached: false,
        mode,
      },
    };
  } else {
    const cardUnitIds = new Set(serveableCards.map((card) => card.schedulingUnitId));
    const activeUnits = isGlobal ? units.filter((unit) => cardUnitIds.has(unit.id)) : units;
    const hasReached = (setting: 'maxReviewsPerDay' | 'dailyReviewGoal') =>
      activeUnits.some((unit) => {
        const config = isGlobal ? unit : schedulingConfig;
        const threshold = config?.[setting];
        return Boolean(threshold && (reviewsByDeck.get(unit.id) ?? 0) >= threshold);
      });
    const limitReached = !isSimpleMode && hasReached('maxReviewsPerDay');
    const goalReached = !isSimpleMode && hasReached('dailyReviewGoal');
    if (
      limitReached ||
      goalReached ||
      (!plannedRevision && !isSimpleMode && sessionComplete(cards, context))
    ) {
      entry = {
        type: 'summary',
        summary: {
          events: [],
          masteryBefore: initialProgress,
          masteryAfter: initialProgress,
          objectiveLabel: isGlobal
            ? 'Predicted readiness across all courses'
            : progressHeading(units[0]),
          focusFraction: 1,
          reachedGoal: limitReached || goalReached ? !limitReached && goalReached : true,
          limitReached,
          ...(!limitReached && !goalReached ? { timeLimitReached: false } : {}),
          mode,
        },
      };
    } else entry = { type: 'serve' };
  }
  return {
    cards,
    performance,
    schedulingUnits,
    schedulingConfig,
    context,
    answerModeLessons,
    linesMode,
    occlusions,
    initialProgress,
    progressBefore,
    schedulerProgress,
    reviewsDayStart,
    reviewsByDeck,
    simple,
    entry,
  };
}
