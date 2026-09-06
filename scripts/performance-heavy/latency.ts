import type { Locator, Page } from '@playwright/test';

export async function clickToReadable(
  page: Page,
  button: Locator,
  selector: string,
  text: string,
  excludedId?: string,
): Promise<{ inputToReadableMs: number }> {
  await button.evaluate(
    (element, options) => {
      const state = {
        start: null as number | null,
        resolve: null as ((value: number) => void) | null,
        listener: null as (() => void) | null,
        element,
        settled: false,
      };
      state.listener = () => {
        state.start = performance.now();
        const check = () => {
          if (state.settled || state.start === null) return;
          const readable = [...document.querySelectorAll<HTMLElement>(options.selector)].some(
            (face) => {
              if (
                options.excludedId &&
                face.closest('[data-study-card-id]')?.getAttribute('data-study-card-id') ===
                  options.excludedId
              )
                return false;
              let opacity = 1;
              let current: HTMLElement | null = face;
              while (current) {
                opacity *= Number.parseFloat(getComputedStyle(current).opacity);
                current = current.parentElement;
              }
              return (
                opacity >= 0.9 &&
                face.getClientRects().length > 0 &&
                face.textContent?.includes(options.text) === true
              );
            },
          );
          if (!readable) {
            requestAnimationFrame(check);
            return;
          }
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (state.settled || state.start === null) return;
              state.settled = true;
              state.resolve?.(performance.now() - state.start);
            }),
          );
        };
        requestAnimationFrame(check);
      };
      const promise = new Promise<number>((resolve) => {
        state.resolve = resolve;
      });
      element.addEventListener('click', state.listener, { once: true });
      (
        window as unknown as {
          __performanceInput?: { state: typeof state; promise: Promise<number> };
        }
      ).__performanceInput = { state, promise };
    },
    { selector, text, excludedId },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await button.click();
    const latency = await Promise.race([
      page.evaluate(
        () =>
          (window as unknown as { __performanceInput: { promise: Promise<number> } })
            .__performanceInput.promise,
      ),
      new Promise<number>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Readable face timeout')), 60_000);
      }),
    ]);
    return { inputToReadableMs: latency };
  } finally {
    if (timeout) clearTimeout(timeout);
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __performanceInput?: {
            state: {
              listener: (() => void) | null;
              element: Element;
              settled: boolean;
              resolve: ((value: number) => void) | null;
            };
          };
        }
      ).__performanceInput;
      if (state) {
        state.state.settled = true;
        state.state.resolve?.(-1);
      }
      state?.state.listener &&
        state.state.element.removeEventListener('click', state.state.listener);
      delete (window as unknown as { __performanceInput?: unknown }).__performanceInput;
    });
  }
}
