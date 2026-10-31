import { type Locator } from '@playwright/test';

export const FLOW_EVIDENCE = process.env.LACUNA_TODAY_EVIDENCE ?? '/tmp/lacuna-today-candidate2';

/** Wait for presented geometry and colour, not just a non-empty DOM rectangle. */
export async function settle(element: Locator) {
  await element.evaluate(
    (node) =>
      new Promise<void>((resolve, reject) => {
        let previous = '',
          stable = 0;
        const started = performance.now();
        const sample = () => {
          const rect = node.getBoundingClientRect();
          const paint = node.querySelector('[data-flow-surface-paint]') ?? node;
          const style = getComputedStyle(paint);
          const current = [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            style.fill,
            style.backgroundColor,
            style.opacity,
            paint.getAttribute('d'),
          ].join('|');
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          if (stable >= 12 && performance.now() - started > 500) resolve();
          else if (performance.now() - started > 5000)
            reject(new Error('The presented surface did not settle'));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

export async function contentRect(element: Locator) {
  return element.evaluate((node) => {
    const text = [...node.childNodes].find((child) => child.textContent?.trim());
    const range = document.createRange();
    range.selectNodeContents(text ?? node);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
