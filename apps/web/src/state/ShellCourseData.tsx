import { useCourseDataClock } from './useExamClock';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { performanceForCards } from '../db/backingDecks';
import { readReviewActivity } from '../db/reviewActivityRead';
import type { ReviewActivity } from '../fsrs/heatmap';
import { db } from '../db/schema';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';
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
  const [clock, setClockBoundaries] = useCourseDataClock();
  // Route changes only toggle the dashboard supplement. Keep the shared library
  // snapshot alive so Today navigation never reloads every Card and its text.
  const data = useLiveQuery(async () => {
    const [records, lessons, cards, assessments, practiceNodes, concepts, lessonLinks] =
      await db.transaction(
        'r',
        [
          db.courses,
          db.lessons,
          db.cards,
          db.courseAssessments,
          db.concepts,
          db.practiceNodes,
          db.lessonCards,
        ],
        async () => {
          const [records, lessons, cards, assessments, practiceNodes] = await Promise.all([
            db.courses.toArray(),
            db.lessons.toArray(),
            db.cards.toArray(),
            db.courseAssessments.toArray(),
            db.practiceNodes.toArray(),
          ]);
          const hasPapers = assessments.some(
            (assessment) => assessment.coverageMode === 'specification',
          );
          const concepts = hasPapers ? await db.concepts.toArray() : [];
          const lessonLinks =
            hasPapers && lessons.length
              ? await db.lessonCards
                  .where('lessonId')
                  .anyOf(lessons.map((lesson) => lesson.id))
                  .toArray()
              : [];
          return [
            records,
            lessons,
            cards,
            assessments,
            practiceNodes,
            concepts,
            lessonLinks,
          ] as const;
        },
      );
    setClockBoundaries({
      exams: [...lessons, ...assessments].map((row) => row.examDate),
      burials: cards.map((card) => card.buriedUntil),
    });
    const courses = records.map((record) =>
      hydrateCourse(record, finalAssessmentForCourse(record.id, assessments)),
    );
    const activity = await readReviewActivity(cards);
    const courseIds = new Set(courses.map((course) => course.id));
    const performance = await performanceForCards(
      cards.filter((card) => card.courseId && courseIds.has(card.courseId)),
    );
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
    const orderedLessons = courses.flatMap((course) =>
      resolveOrder(
        course,
        lessons.filter((lesson) => lesson.courseId === course.id),
        assessments.filter((assessment) => assessment.courseId === course.id),
        practiceNodes.filter((node) => node.courseId === course.id),
      ),
    );
    const deckSeconds = buildDeckSecondsMap(performance);
    const forecastCourses = courses.filter((course) => !paperCourseIds.has(course.id));
    const sidebarAt = (now: number): SidebarData => ({
      courses,
      lessons: orderedLessons,
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
        deckSeconds,
        now,
        activeCourseIds,
        activity,
        schedulingByCourse,
      ),
      // The legacy forecast assumes one horizon; paper Courses use their per-Card summary.
      forecasts: dashboardForecasts(forecastCourses, lessons, cards, now),
    });

    return {
      sidebarAt,
      // The closure retains the current shared snapshot, not an independent cache:
      // Dexie's live query replaces it whenever its underlying records change.
      loadDashboard: async (): Promise<ShellCourseData> => {
        const [links, exposures, completions, coursePerformance] = await db.transaction(
          'r',
          [db.lessonCards, db.lessonCardExposures, db.lessonCompletions, db.coursePerformance],
          () =>
            Promise.all([
              db.lessonCards.toArray(),
              db.lessonCardExposures.toArray(),
              db.lessonCompletions.toArray(),
              db.coursePerformance.toArray(),
            ]),
        );
        const courseSeconds = new Map<string, number>();
        for (const row of coursePerformance) {
          if (row.totalCorrectReviews > 0 && row.runningMeanResponseTime > 0) {
            courseSeconds.set(row.courseId, row.runningMeanResponseTime);
          }
        }
        // Time advances without a database mutation. Refresh eligibility and the
        // sidebar alongside Today while reusing the retained records.
        const now = Date.now();
        const sidebar = sidebarAt(now);
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
      },
    };
  }, [clock]);

  const dashboard = useLiveQuery(async () => {
    if (!includeDashboard || !data) return undefined;
    return data.loadDashboard();
  }, [includeDashboard, data]);
  const value = useMemo<ShellCourseData | undefined>(() => {
    if (!data) return undefined;
    // Retain a complete published snapshot while an updated supplement resolves.
    // Its sidebar and dashboard must refer to the same set of Cards.
    if (includeDashboard && dashboard) {
      return dashboard;
    }
    return { sidebar: data.sidebarAt(Date.now()) };
  }, [data, dashboard, includeDashboard]);

  return (
    <ShellCourseDataContext.Provider value={value}>{children}</ShellCourseDataContext.Provider>
  );
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
