import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ video: 'on' });

for (const [width, reducedMotion] of [
  [1440, 'no-preference'],
  [390, 'no-preference'],
  [390, 'reduce'],
] as const) {
  test(`Exit arrives with the session at ${width}px (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Session entrance');
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front' }).fill('Session entrance question');
    await page.getByRole('textbox', { name: 'Back' }).fill('Session entrance answer');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page
      .getByRole('navigation', { name: 'Course sections' })
      .getByRole('link', { name: 'Path', exact: true })
      .click();
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    const start = page
      .getByRole('region', { name: 'Session preview' })
      .getByRole('button', { name: 'Start session' })
      .first();
    await expect(start).toBeEnabled();
    const frames = await start.evaluate((button) => {
      const frames: { time: number; opacity: number; covered: boolean }[] = [];
      const started = performance.now();
      const done = new Promise<typeof frames>((resolve, reject) => {
        function sample() {
          const cover = document.querySelector('[data-testid="study-cover"]');
          const exit = [...document.querySelectorAll('header button')].find(
            (element) => element.textContent?.trim() === 'Exit' && !element.closest('[inert]'),
          );
          if (exit) {
            let opacity = 1;
            for (let element: Element | null = exit; element; element = element.parentElement) {
              opacity *= Number(getComputedStyle(element).opacity);
            }
            frames.push({ time: performance.now() - started, opacity, covered: !!cover });
          }
          if (!cover && frames.length > 0 && performance.now() - started > 700) {
            resolve(frames);
          } else if (performance.now() - started > 5000) {
            reject(new Error('The session entrance did not settle.'));
          } else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      (button as HTMLButtonElement).click();
      return done;
    });
    await testInfo.attach('exit-entrance-frames', {
      body: JSON.stringify(frames, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('session.png') });
    if (reducedMotion === 'no-preference') {
      const covered = frames.filter((frame) => frame.covered);
      expect(covered.length).toBeGreaterThan(0);
      expect(covered[0].opacity).toBeLessThan(0.95);
      expect(covered.some((frame) => frame.opacity > 0 && frame.opacity < 0.95)).toBe(true);
      expect(covered.at(-1)!.opacity).toBe(1);
    } else {
      expect(frames.every((frame) => !frame.covered && frame.opacity === 1)).toBe(true);
    }
    expect(frames.at(-1)!.opacity).toBe(1);
    await expect(page.locator('[data-study-face="front"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Leave this session?' })
      .getByRole('button', { name: 'Leave', exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/study/);
  });
}
