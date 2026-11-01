import { COURSE_PAGE_FRAME } from './coursePageLayout';
import { useCourse } from '../../state/useCourseData';
import { CoursePageNavigation } from './CoursePageNavigation';
import { COURSE_SECTIONS, matchCourseSection } from './courseSections';
import { useLayoutEffect, useRef, useState } from 'react';
import { useIdleRoutePrefetch } from '../../routes/useIdleRoutePrefetch';

/**
 * Whether the route's own course title is on screen. The bar's course name
 * would only repeat it, so the bar shows the name once the title scrolls away.
 * An entered Path counts its title as on screen until the page has loaded.
 */
export function useCourseTitleInView(pathname: string): boolean {
  const entered = useRef(pathname);
  const moved = useRef(false);
  // Entering a course on Path, its heading is usually still loading. Keep the name out
  // of the bar until the page shows whether it has one, so it does not appear only to
  // vanish. Returning to Path keeps the name there until the heading takes it over.
  const [inView, setInView] = useState(() => matchCourseSection(pathname)?.index === 0);
  useLayoutEffect(() => {
    if (pathname !== entered.current) moved.current = true;
    const pending = !moved.current && matchCourseSection(pathname)?.index === 0;
    setInView(pending);
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
      if (!title) {
        // A missing course settles with an error heading instead of a course title.
        if (pending && page?.querySelector('h1')) setInView(false);
        return;
      }
      const bounds = title.getBoundingClientRect();
      setInView(bounds.bottom > 0 && bounds.top < window.innerHeight);
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
  useIdleRoutePrefetch(COURSE_SECTIONS.map(({ suffix }) => `/course/${courseId}${suffix}`));
  const titleInView = useCourseTitleInView(pathname);
  const archived = course?.archived === true;
  const lesson = /^\/course\/[^/]+\/lesson\/[^/]+$/.test(pathname);

  return (
    // The bar's own `sticky` would end with this short wrapper, so the wrapper sticks
    // instead; its negative offset lets the top padding scroll away first.
    <div className={`${COURSE_PAGE_FRAME} sticky -top-8 z-20 mb-4 pt-8`}>
      <CoursePageNavigation
        courseId={courseId}
        course={course ?? undefined}
        backTo={archived ? '/archived' : lesson ? `/course/${courseId}` : '/'}
        backLabel={archived ? 'Archived courses' : lesson ? 'Course' : 'All courses'}
        archived={archived}
        identityHidden={titleInView || !course}
        identity={course ? { name: course.name, back: lesson } : { name: '' }}
      />
    </div>
  );
}
