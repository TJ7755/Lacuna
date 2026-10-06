import { COURSE_PAGE_FRAME } from './coursePageLayout';
import { useCourse } from '../../state/useCourseData';
import { CoursePageNavigation } from './CoursePageNavigation';
import { useEffect, useState } from 'react';

/**
 * Whether the route's own course title is on screen. The bar's course name
 * would only repeat it, so the bar shows the name once the title scrolls away.
 */
export function useCourseTitleInView(pathname: string): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    setInView(false);
    if (typeof IntersectionObserver === 'undefined') return;
    let observer: IntersectionObserver | undefined;
    const attach = () => {
      const page =
        (pathname && document.querySelector(`[data-route-content="${CSS.escape(pathname)}"]`)) || document;
      const title = page.querySelector('[data-course-title]');
      if (!title) return false;
      observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
      observer.observe(title);
      return true;
    };
    // A lazy page renders its title after the route changes, so wait for it to arrive.
    const waiting = attach()
      ? undefined
      : new MutationObserver(() => {
          if (attach()) waiting?.disconnect();
        });
    waiting?.observe(document.body, { childList: true, subtree: true });
    return () => {
      waiting?.disconnect();
      observer?.disconnect();
    };
  }, [pathname]);
  return inView;
}

/** Course chrome is owned by the shell, outside the changing route content. */
export function CourseSectionNavigation({
  courseId,
  pathname = '',
}: {
  courseId: string;
  /** The route being shown, to find its title among pages still animating. */
  pathname?: string;
}) {
  const course = useCourse(courseId);
  const titleInView = useCourseTitleInView(pathname);
  const archived = course?.archived === true;

  return (
    <div className={`${COURSE_PAGE_FRAME} mb-4 pt-8`}>
      <CoursePageNavigation
        courseId={courseId}
        course={course ?? undefined}
        backTo={archived ? '/archived' : '/'}
        backLabel={archived ? 'Archived courses' : 'All courses'}
        archived={archived}
        identityHidden={titleInView}
        identity={course ? { name: course.name } : undefined}
      />
    </div>
  );
}
