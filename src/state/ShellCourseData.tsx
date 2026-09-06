import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { performanceForCards } from '../db/backingDecks';
import { readReviewActivity } from '../db/reviewActivityRead';
import type { ReviewActivity } from '../fsrs/heatmap';
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
  reviewActivity: ReviewActivity;
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
    const activity = await readReviewActivity(cards);
    const courseIds = new Set(courses.map((course) => course.id));
    const performance = await performanceForCards(
      cards.filter((card) => card.courseId && courseIds.has(card.courseId)),
    );
    const now = Date.now();
    const activeCourseIds = new Set(
      courses.filter((course) => !course.archived).map((course) => course.id),
    );
    const sidebar: SidebarData = {
      courses,
      lessons,
      summaries: computeCourseSummaries(
        courses,
        lessons,
        cards,
        assessments,
        now,
        undefined,
        activity,
      ),
      stats: computeStudyStats(
        cards,
        buildDeckSecondsMap(performance),
        now,
        activeCourseIds,
        activity,
      ),
    };

    // Navigation retains derived figures. The dashboard also needs card projections
    // and compact activity timestamps for its hover details and heatmap.
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
        allCards: cards,
        reviewActivity: activity,
        summaries: computeCourseSummaries(
          courses,
          lessons,
          cards,
          assessments,
          now,
          {
            links,
            exposures,
            completions,
          },
          activity,
        ),
        // Dashboard response-time calibration is course-based; navigation keeps
        // scheduling-unit pacing. Sharing the records must not conflate the two.
        stats: computeStudyStats(cards, courseSeconds, now, activeCourseIds, activity),
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
