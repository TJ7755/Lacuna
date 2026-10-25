import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

type LayerSample = { frame: number; overlap: boolean; top?: string; x?: number; y?: number };
type LayerWindow = Window & {
  layerSamples: LayerSample[];
  layerRecording: Promise<LayerSample[]>;
};

async function switchSurface(page: Page, trigger: Locator, opening: 'study' | 'other') {
  const capture = await page.context().newCDPSession(page);
  await trigger.evaluate((button) => {
    const state = window as unknown as LayerWindow;
    state.layerSamples = [];
    state.layerRecording = new Promise((resolve) => {
      button.addEventListener(
        'click',
        () => {
          let frame = 0;
          function sample() {
            frame++;
            const study = document.querySelector<HTMLElement>('[data-expanding-action="study"]');
            const other = document
              .querySelector<HTMLButtonElement>('button[aria-label="Other ways to study"]')
              ?.closest<HTMLElement>('[data-expanding-action]');
            if (frame <= 12 || frame === 18 || frame === 24) {
              const result: LayerSample = { frame, overlap: false };
              if (study && other) {
                const a = study.getBoundingClientRect();
                const b = other.getBoundingClientRect();
                const left = Math.max(a.left, b.left);
                const right = Math.min(a.right, b.right);
                // Sample below the triggers, inside the intersecting panel bodies.
                const top = Math.max(a.top, b.top) + 52;
                const bottom = Math.min(a.bottom, b.bottom);
                if (right - left > 12 && bottom - top > 12) {
                  const x = (left + right) / 2;
                  const y = (top + bottom) / 2;
                  // Inert suppresses hit-testing, not painting. Clear it synchronously
                  // for this probe so an exiting surface can expose the original bug.
                  const inert = [...document.querySelectorAll<HTMLElement>('[inert]')];
                  let hit: Element | null;
                  try {
                    inert.forEach((element) => {
                      element.inert = false;
                    });
                    hit =
                      document.elementFromPoint(x, y)?.closest('[data-expanding-action]') ?? null;
                  } finally {
                    inert.forEach((element) => {
                      element.inert = true;
                    });
                  }
                  result.overlap = true;
                  result.x = x;
                  result.y = y;
                  result.top = hit === study ? 'study' : hit === other ? 'other' : 'neither';
                }
              }
              state.layerSamples.push(result);
            }
            if (frame < 24) requestAnimationFrame(sample);
            else resolve(state.layerSamples);
          }
          requestAnimationFrame(sample);
        },
        { once: true },
      );
    });
  });
  // The open Other ways surface covers Study's centre; use its exposed left edge.
  await trigger.click(opening === 'study' ? { position: { x: 10, y: 24 } } : {});
  await page.waitForFunction(
    (frame) => (window as unknown as LayerWindow).layerSamples.length >= frame,
    opening === 'study' ? 1 : 4,
  );
  // Capture the current compositor frame without screenshot()'s font/paint waits.
  const { data } = await capture.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
  });
  const directory = path.resolve('artifacts/course-popover-layering');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${opening}-opening.png`), Buffer.from(data, 'base64'));
  await capture.detach();
  const samples = await page.evaluate(() => (window as unknown as LayerWindow).layerRecording);
  const overlapping = samples.filter((sample) => sample.overlap);
  expect(overlapping.length, JSON.stringify(samples)).toBeGreaterThanOrEqual(3);
  expect(
    overlapping.every((sample) => sample.top === opening),
    JSON.stringify(samples),
  ).toBe(true);
}

test('the opening course action stays above the closing surface in both directions', async ({
  page,
}) => {
  // Keep animation samples at a consistent cadence when the CI compositor drops frames.
  await page.clock.install();
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('navigation', { name: 'Courses', exact: true })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  const study = page.getByRole('button', { name: 'Study', exact: true });
  const other = page.getByRole('button', { name: 'Other ways to study' });
  await study.click();
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-expanding-action="study"]')
        .evaluate((surface) => Math.round(surface.getBoundingClientRect().width)),
    )
    .toBe(448);

  await switchSurface(page, other, 'other');
  await expect(page.locator('[data-expanding-action="study"]')).toHaveCount(0);
  await expect
    .poll(() =>
      other.evaluate((button) =>
        Math.round(button.closest('[data-expanding-action]')!.getBoundingClientRect().width),
      ),
    )
    .toBe(216);
  await switchSurface(page, study, 'study');
});
