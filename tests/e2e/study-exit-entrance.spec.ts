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
      const frames: {
        time: number;
        covered: boolean;
        surfaceTop: number | null;
        headerPaintsTop: boolean;
        pendingExitOpacity: number;
        exitOpacity: number | null;
      }[] = [];
      const opacity = (element: Element | null | undefined) => {
        if (!element) return 0;
        let value = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          value *= Number(getComputedStyle(node).opacity);
        }
        return value;
      };
      const started = performance.now();
      const done = new Promise<typeof frames>((resolve, reject) => {
        function sample() {
          const cover = document.querySelector('[data-testid="study-cover"]');
          const surface = cover?.querySelector('.flow-surface');
          const pendingHeader = cover?.querySelector('header');
          const exit = [...document.querySelectorAll('[data-study-entrance] header button')].find(
            (element) => element.textContent?.trim() === 'Exit',
          );
          frames.push({
            time: performance.now() - started,
            covered: !!cover,
            surfaceTop: surface?.getBoundingClientRect().top ?? null,
            headerPaintsTop:
              !!pendingHeader &&
              opacity(pendingHeader) > 0.01 &&
              getComputedStyle(pendingHeader).backgroundColor !== 'rgba(0, 0, 0, 0)',
            pendingExitOpacity: opacity(pendingHeader?.querySelector('button')),
            exitOpacity: exit ? opacity(exit) * (1 - opacity(surface)) : null,
          });
          if (!cover && !!exit && performance.now() - started > 900) {
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
    const sessionFrames = frames.filter((frame) => frame.exitOpacity !== null);
    expect(sessionFrames.length).toBeGreaterThan(0);
    if (reducedMotion === 'no-preference') {
      const expanding = frames.filter(
        (frame) => frame.surfaceTop !== null && frame.surfaceTop > 84,
      );
      expect(expanding.length).toBeGreaterThan(0);
      expect(expanding.every((frame) => !frame.headerPaintsTop)).toBe(true);
      expect(expanding.every((frame) => frame.pendingExitOpacity <= 0.01)).toBe(true);
      expect(
        sessionFrames.some(
          (frame) => frame.covered && frame.exitOpacity! > 0 && frame.exitOpacity! < 0.95,
        ),
      ).toBe(true);
      const revealed = sessionFrames.find((frame) => !frame.covered)!;
      expect(revealed.exitOpacity).toBeGreaterThanOrEqual(0.95);
    } else {
      expect(sessionFrames.every((frame) => !frame.covered && frame.exitOpacity === 1)).toBe(true);
    }
    expect(sessionFrames.at(-1)!.exitOpacity).toBe(1);
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
