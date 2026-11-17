/** Shared content edges for every page, so titles and content line up as you move around. */
export const PAGE_FRAME = 'mx-auto w-full max-w-[1190px] px-[18px] min-[481px]:px-6 md:px-10';

/** Shared content edges for the course navigation, sections and loading states. */
export const COURSE_PAGE_FRAME = PAGE_FRAME;

/** Consistent heading rhythm across the course's peer sections. */
export const PAGE_HEADER = 'mb-8 flex flex-wrap items-start justify-between gap-4 pt-6 md:pt-8';
export const PAGE_TITLE = 'font-display text-4xl font-semibold tracking-tight md:text-[44px]';
export const COURSE_PAGE_HEADER = PAGE_HEADER;
export const COURSE_PAGE_TITLE = PAGE_TITLE;

/** The course route can still be loading after the initiating page has unmounted. */
export function focusCourseHeading(pathname: string) {
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
