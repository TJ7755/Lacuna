/** How long a return can wait for lazy content to make the old position reachable. */
const RESTORE_WINDOW_MS = 1200;

export function restoreScrollPosition(
  container: HTMLElement,
  target: number,
  {
    onFinish,
    isCurrent = () => true,
  }: {
    onFinish: (learnerPosition?: number) => void;
    isCurrent?: () => boolean;
  },
): (() => void) | undefined {
  const apply = () => {
    container.scrollTo({ top: target });
    return container.scrollTop;
  };
  let appliedTop = apply();
  if (Math.abs(appliedTop - target) <= 1) {
    onFinish();
    return;
  }

  let observer: ResizeObserver | undefined;
  const timeout = window.setTimeout(() => finish(), RESTORE_WINDOW_MS);
  const stop = () => {
    observer?.disconnect();
    observer = undefined;
    window.clearTimeout(timeout);
    container.removeEventListener('scroll', yieldToScroll);
  };
  const finish = (learnerPosition?: number) => {
    stop();
    onFinish(learnerPosition);
  };
  const yieldToScroll = () => {
    if (!isCurrent()) {
      finish();
      return;
    }
    const top = container.scrollTop;
    if (Math.abs(top - appliedTop) <= 1) return;
    // Shrinking content can clamp the position without the learner scrolling.
    const maxTop = container.scrollHeight - container.clientHeight;
    if (Math.abs(top - Math.min(appliedTop, maxTop)) > 1) finish(top);
  };

  observer = new ResizeObserver(() => {
    yieldToScroll();
    if (!observer) return;
    appliedTop = apply();
    if (Math.abs(appliedTop - target) <= 1) finish();
  });
  // The viewport can stay fixed while its in-flow route and chrome grow.
  observer.observe(container);
  for (const child of container.children) observer.observe(child);
  container.addEventListener('scroll', yieldToScroll, { passive: true });
  return stop;
}
