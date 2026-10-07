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
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    // The shell mounts before lazy pages and their course data. Wait for this
    // route's title rather than permanently missing it during its loading state.
    const waitForTitle = new MutationObserver(observeTitle);
    function observeTitle() {
      const page = pathname
        ? document.querySelector(`[data-route-content="${CSS.escape(pathname)}"]`)
        : document;
      const title = page?.querySelector('[data-course-title]');
      if (!title) return;
      observer.observe(title);
      waitForTitle.disconnect();
    }
    waitForTitle.observe(document.body, { childList: true, subtree: true });
    observeTitle();
    return () => {
      observer.disconnect();
      waitForTitle.disconnect();
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
    // The bar's own `sticky` would end with this short wrapper, so the wrapper sticks
    // instead; its negative offset lets the top padding scroll away first.
    <div className={`${COURSE_PAGE_FRAME} sticky -top-8 z-20 mb-4 pt-8`}>
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
