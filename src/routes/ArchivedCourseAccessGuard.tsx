import type { ReactNode } from 'react';
import { matchPath, Navigate, useLocation, useParams } from 'react-router-dom';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useCourse, useLesson } from '../state/useCourseData';

const ARCHIVED_INSPECTION_PATHS = [
  '/course/:courseId',
  '/course/:courseId/lesson/:lessonId',
  '/course/:courseId/analytics',
] as const;

function allowsArchivedInspection(pathname: string, courseId: string): boolean {
  return ARCHIVED_INSPECTION_PATHS.some((path) => {
    const match = matchPath({ path, end: true }, pathname);
    return match?.params.courseId === courseId;
  });
}

/**
 * Resolves a course before entering any course-owned route. Archived courses may
 * inspect their overview, lessons and analytics, but every study or mutation
 * destination returns to the read-only overview until the course is restored.
 */
export function ArchivedCourseAccessGuard({ children }: { children: ReactNode }) {
  const { courseId: courseIdParam, lessonId } = useParams<{
    courseId?: string;
    lessonId?: string;
  }>();
  const location = useLocation();
  const lesson = useLesson(courseIdParam ? undefined : lessonId);
  const courseId = courseIdParam ?? lesson?.courseId;
  const course = useCourse(courseId);

  const resolvingLessonCourse = !courseIdParam && lessonId !== undefined && lesson === undefined;
  if (resolvingLessonCourse || (courseId !== undefined && course === undefined)) {
    return (
      <DelayedFallback>
        <div className="flex min-h-[50vh] items-center justify-center" role="status">
          <span className="text-sm text-ink-faint">Loading course…</span>
        </div>
      </DelayedFallback>
    );
  }

  if (course?.archived && courseId && !allowsArchivedInspection(location.pathname, courseId)) {
    return <Navigate to={`/course/${courseId}`} replace />;
  }

  return children;
}
