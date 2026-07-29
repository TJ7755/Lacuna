export const SCROLL_ACTION_DISTANCE = 240;

export type ScrollDrivenDemoHandle = {
  consumeScroll: (deltaY: number) => boolean;
};

/**
 * Only take over once the lesson has reached the top reading margin and the
 * whole demo is visible. The automated path is a fallback after the visitor
 * has had a proper chance to use the controls themselves.
 */
export function isDemoInReadingArea(element: HTMLElement | null): boolean {
  if (!element) return false;
  const lesson = element.closest('section');
  if (!lesson) return false;
  const demoRect = element.getBoundingClientRect();
  const lessonRect = lesson.getBoundingClientRect();
  const topMargin = Math.min(64, window.innerHeight * 0.06);
  const bottomMargin = 24;
  return (
    lessonRect.top <= topMargin &&
    lessonRect.top >= -topMargin &&
    demoRect.bottom <= window.innerHeight - bottomMargin
  );
}
