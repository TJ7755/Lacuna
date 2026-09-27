import { COURSE_PAGE_FRAME } from './coursePageLayout';
import { useCourse } from '../../state/useCourseData';
import { CoursePageNavigation } from './CoursePageNavigation';

/** Course chrome is owned by the shell, outside the changing route content. */
export function CourseSectionNavigation({ courseId }: { courseId: string }) {
  const course = useCourse(courseId);
  const archived = course?.archived === true;

  return (
    <div className={`${COURSE_PAGE_FRAME} mb-4 pt-8`}>
      <CoursePageNavigation
        courseId={courseId}
        course={course ?? undefined}
        backTo={archived ? '/archived' : '/'}
        backLabel={archived ? 'Archived courses' : 'All courses'}
        archived={archived}
      />
    </div>
  );
}
