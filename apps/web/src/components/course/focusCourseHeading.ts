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
