import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { useLayoutEffect, useRef } from 'react';
import { useIsPresent } from 'motion/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { ShareLinkImport } from '../components/import/ShareLinkImport';
import { onboardingDestination } from '../onboarding/onboardingState';

/**
 * Student entry point for teacher share links (`/#/s/<code>`). `ShareLinkImport` fetches the
 * published course and carries course-file support statically, for offline first use.
 */
export function ShareLinkPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const present = useIsPresent();
  const activeImportRoute = useRef<string | null>(null);

  useLayoutEffect(() => {
    activeImportRoute.current = present ? location.key : null;
    return () => {
      activeImportRoute.current = null;
    };
  }, [location.key, present]);

  return (
    <div className={`${PAGE_FRAME} pb-10`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Shared course</h1>
      </header>
      <ShareLinkImport
        code={code ?? ''}
        isCurrent={() => activeImportRoute.current === location.key}
        onOpenCourse={(courseId) => {
          const pathname = `/course/${encodeURIComponent(courseId)}`;
          const destination = onboardingDestination(pathname);
          void navigate(destination);
          if (destination === pathname) focusImportedCourseHeading(pathname);
        }}
        alternative={(shortCode) =>
          shortCode ? (
            <Link to="/?import=1&join=1" className={buttonClassName('ghost', 'sm')}>
              Enter another class code
            </Link>
          ) : (
            <Link to="/share" className={buttonClassName('ghost', 'sm')}>
              Back to Share
            </Link>
          )
        }
      />
    </div>
  );
}

/** The course route can still be loading after the share page has unmounted. */
function focusImportedCourseHeading(pathname: string) {
  const previousFocus = document.activeElement;
  const previousPage = document.querySelector('[data-route-content]:not([inert])');
  const observer = new MutationObserver(focusHeading);
  let frame = 0;
  const timeout = window.setTimeout(stop, 10_000);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(frame);
  }
  function focusHeading() {
    window.cancelAnimationFrame(frame);
    const page = document.querySelector('[data-route-content]:not([inert])');
    if (page && page !== previousPage && page.getAttribute('data-route-content') !== pathname) {
      stop();
      return;
    }
    const heading = document.querySelector<HTMLElement>(
      `[data-route-content="${CSS.escape(pathname)}"]:not([inert]) h1`,
    );
    if (!heading || heading.closest('[inert]')) return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== previousFocus &&
      !active.closest('[inert]')
    ) {
      stop();
      return;
    }
    heading.tabIndex = -1;
    heading.focus();
    if (document.activeElement === heading) stop();
    else frame = window.requestAnimationFrame(focusHeading);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  focusHeading();
}
