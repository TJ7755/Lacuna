import { useCourse } from '../../state/useCourseData';
import { CoursePageNavigation } from './CoursePageNavigation';

/** Course chrome is owned by the shell, outside the changing route content. */
export function CourseSectionNavigation({ courseId }: { courseId: string }) {
  const course = useCourse(courseId);
  const archived = course?.archived === true;

  return (
    <div className="mx-auto mb-4 max-w-3xl px-6 pt-8 md:px-10">
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
