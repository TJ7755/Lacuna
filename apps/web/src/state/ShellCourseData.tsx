import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { performanceForCards } from '../db/backingDecks';
import { readReviewActivity } from '../db/reviewActivityRead';
import type { ReviewActivity } from '../fsrs/heatmap';
import { db } from '../db/schema';
import type { Card, Course, Lesson } from '../db/types';
import { buildDeckSecondsMap, computeStudyStats, type StudyStats } from '../fsrs/stats';
import { computeCourseSummaries, type CourseSummary } from './courseSummaries';
import { dashboardForecasts } from './dashboardForecasts';
import type { CourseForecast } from '../fsrs/courseForecast';
import { courseColours } from '../course/colour';
import { lessonOrder } from '../course/assessmentCoverage';

interface SidebarData {
  courses: Course[];
  lessons: Lesson[];
  summaries: Record<string, CourseSummary>;
  stats: StudyStats;
  /** Keep-to-schedule exam-day forecasts per active course, cached per course. */
  forecasts: Record<string, CourseForecast>;
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
    const [
      records,
      lessons,
      cards,
      assessments,
      practiceNodes,
      concepts,
      lessonLinks,
      dashboardRows,
    ] = await db.transaction(
      'r',
      [
        db.courses,
        db.lessons,
        db.cards,
        db.courseAssessments,
        db.concepts,
        db.practiceNodes,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.coursePerformance,
      ],
      async () => {
        const [records, lessons, cards, assessments, practiceNodes, dashboardRows] =
          await Promise.all([
            db.courses.toArray(),
            db.lessons.toArray(),
            db.cards.toArray(),
            db.courseAssessments.toArray(),
            db.practiceNodes.toArray(),
            includeDashboard
              ? Promise.all([
                  db.lessonCards.toArray(),
                  db.lessonCardExposures.toArray(),
                  db.lessonCompletions.toArray(),
                  db.coursePerformance.toArray(),
                ])
              : undefined,
          ]);
        const hasPapers = assessments.some(
          (assessment) => assessment.coverageMode === 'specification',
        );
        const concepts = hasPapers ? await db.concepts.toArray() : [];
        const lessonLinks =
          dashboardRows?.[0] ??
          (hasPapers && lessons.length
            ? await db.lessonCards
                .where('lessonId')
                .anyOf(lessons.map((lesson) => lesson.id))
                .toArray()
            : []);
        return [
          records,
          lessons,
          cards,
          assessments,
          practiceNodes,
          concepts,
          lessonLinks,
          dashboardRows,
        ] as const;
      },
    );
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
    const schedulingByCourse = new Map(courses.map((course) => [course.id, course]));
    const paperCourseIds = new Set(
      assessments
        .filter((assessment) => assessment.coverageMode === 'specification')
        .map((assessment) => assessment.courseId),
    );
    const resolveOrder = courses.some((course) => course.localLessonOrder)
      ? (await import('../course/lessonOrder')).resolveCourseLessonOrder
      : (_course: Course, courseLessons: Lesson[]) => courseLessons.sort(lessonOrder);
    const sidebar: SidebarData = {
      courses,
      lessons: courses.flatMap((course) =>
        resolveOrder(
          course,
          lessons.filter((lesson) => lesson.courseId === course.id),
          assessments.filter((assessment) => assessment.courseId === course.id),
          practiceNodes.filter((node) => node.courseId === course.id),
        ),
      ),
      summaries: computeCourseSummaries(
        courses,
        lessons,
        cards,
        assessments,
        now,
        { links: lessonLinks, exposures: [], completions: [] },
        activity,
        concepts,
      ),
      stats: computeStudyStats(
        cards,
        buildDeckSecondsMap(performance),
        now,
        activeCourseIds,
        activity,
        schedulingByCourse,
      ),
      // The legacy forecast assumes one horizon; paper Courses use their per-Card summary.
      forecasts: dashboardForecasts(
        courses.filter((course) => !paperCourseIds.has(course.id)),
        lessons,
        cards,
        now,
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
          concepts,
        ),
        forecasts: sidebar.forecasts,
        // Dashboard response-time calibration is course-based; navigation keeps
        // scheduling-unit pacing. Sharing the records must not conflate the two.
        stats: computeStudyStats(
          cards,
          courseSeconds,
          now,
          activeCourseIds,
          activity,
          schedulingByCourse,
        ),
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

/** One course's keep-to-schedule forecast, or undefined outside the app shell. */
export function useCourseForecast(courseId: string | undefined): CourseForecast | undefined {
  const data = useContext(ShellCourseDataContext);
  return courseId && data ? data.sidebar.forecasts[courseId] : undefined;
}

export function useCourseDashboardData(): CourseDashboardData | undefined {
  return useShellCourseData()?.dashboard;
}

/** Course identity uses the same complete course list as navigation and the dashboard. */
export function useCourseColours(): ReadonlyMap<string, string> {
  const courses = useContext(ShellCourseDataContext)?.sidebar.courses;
  return useMemo(
    () =>
      courseColours(courses?.filter((course) => !course.archived).map((course) => course.id) ?? []),
    [courses],
  );
}
