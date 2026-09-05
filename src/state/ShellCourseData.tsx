import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { performanceForCards } from '../db/backingDecks';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { db } from '../db/schema';
import type { Card, Course, Lesson } from '../db/types';
import { buildDeckSecondsMap, computeStudyStats, type StudyStats } from '../fsrs/stats';
import { computeCourseSummaries, type CourseSummary } from './courseSummaries';

interface SidebarData {
  courses: Course[];
  lessons: Lesson[];
  summaries: Record<string, CourseSummary>;
  stats: StudyStats;
}

interface CourseDashboardData extends SidebarData {
  allCards: Card[];
}

interface ShellCourseData {
  sidebar: SidebarData;
  dashboard?: CourseDashboardData;
}

// null means a missing owner; undefined is an owner's initial loading state.
const ShellCourseDataContext = createContext<ShellCourseData | undefined | null>(null);

export function ShellCourseDataProvider({
  includeDashboard = false,
  children,
}: {
  includeDashboard?: boolean;
  children: ReactNode;
}) {
  const data = useLiveQuery(async (): Promise<ShellCourseData> => {
    const [records, lessons, cards, assessments, dashboardRows] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.cards.toArray(),
      db.courseAssessments.toArray(),
      includeDashboard
        ? Promise.all([
            db.lessonCards.toArray(),
            db.lessonCardExposures.toArray(),
            db.lessonCompletions.toArray(),
            db.coursePerformance.toArray(),
          ])
        : undefined,
    ]);
    const courses = records.map((record) =>
      hydrateCourse(record, finalAssessmentForCourse(record.id, assessments)),
    );
    const hydratedCards = await hydrateCardsWithHistory(cards);
    const courseIds = new Set(courses.map((course) => course.id));
    const performance = await performanceForCards(
      hydratedCards.filter((card) => card.courseId && courseIds.has(card.courseId)),
    );
    const now = Date.now();
    const activeCourseIds = new Set(
      courses.filter((course) => !course.archived).map((course) => course.id),
    );
    const sidebar: SidebarData = {
      courses,
      lessons,
      summaries: computeCourseSummaries(courses, lessons, hydratedCards, assessments, now),
      stats: computeStudyStats(
        hydratedCards,
        buildDeckSecondsMap(performance),
        now,
        activeCourseIds,
      ),
    };

    // Navigation retains derived figures, never the full card/history graph. Only
    // the mounted dashboard needs that graph and these extra table subscriptions.
    if (!dashboardRows) return { sidebar };

    const [links, exposures, completions, coursePerformance] = dashboardRows;
    const courseSeconds = new Map<string, number>();
    for (const row of coursePerformance) {
      if (row.totalCorrectReviews > 0 && row.runningMeanResponseTime > 0) {
        courseSeconds.set(row.courseId, row.runningMeanResponseTime);
      }
    }
    return {
      sidebar,
      dashboard: {
        courses,
        lessons,
        allCards: hydratedCards,
        summaries: computeCourseSummaries(courses, lessons, hydratedCards, assessments, now, {
          links,
          exposures,
          completions,
        }),
        // Dashboard response-time calibration is course-based; navigation keeps
        // scheduling-unit pacing. Sharing the records must not conflate the two.
        stats: computeStudyStats(hydratedCards, courseSeconds, now, activeCourseIds),
      },
    };
  }, [includeDashboard]);

  return <ShellCourseDataContext.Provider value={data}>{children}</ShellCourseDataContext.Provider>;
}

function useShellCourseData() {
  const data = useContext(ShellCourseDataContext);
  if (data === null) throw new Error('Course data requires ShellCourseDataProvider.');
  return data;
}

export function useSidebarData(): SidebarData | undefined {
  return useShellCourseData()?.sidebar;
}

export function useCourseDashboardData(): CourseDashboardData | undefined {
  return useShellCourseData()?.dashboard;
}
