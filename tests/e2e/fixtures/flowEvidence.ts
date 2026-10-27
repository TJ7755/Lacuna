import sharp from 'sharp';
import { expect, type Locator, type Page } from '@playwright/test';

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

export async function opaquePixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (Math.round(y) * info.width + Math.round(x)) * 4;
  return [...data.subarray(offset, offset + 4)];
}

/** Read the primary painted edge from pixels to reject wavy desktop feedback. */
export async function upperEdge(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const green = (x: number, y: number) => {
    const offset = (y * info.width + x) * 4;
    const [r, g, b] = data.subarray(offset, offset + 3);
    return g > 175 && g > r * 1.05 && g > b * 1.4;
  };
  return [0.34, 0.5, 0.66].map((fraction) => {
    const x = Math.round(info.width * fraction);
    for (let y = 0; y < Math.min(12, info.height); y++) if (green(x, y)) return y;
    throw new Error(`Primary paint missing at x=${x}`);
  });
}

export async function setDark(page: Page) {
  const toggle = page.getByRole('button', { name: 'Toggle colour theme' });
  await toggle.click(); // light -> auto
  await toggle.click(); // auto -> dark
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.mouse.move(0, 0);
}
