import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function measureFlip(page: Page, destination: 'front' | 'back') {
  return page.evaluate((destination) => {
    const current = document.querySelector('[data-study-face]');
    const control = current?.closest('[role="button"]');
    if (!control) throw new Error('The study card control is missing.');
    return new Promise<{ durations: Record<string, number>; elapsed: number }>(
      (resolve, reject) => {
        const durations: Record<string, number> = {};
        const started = performance.now();
        control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        function sample() {
          const face = document.querySelector('[data-study-face]');
          const surface = face?.parentElement;
          const animations = surface?.getAnimations() ?? [];
          for (const animation of animations) {
            const effect = animation.effect as KeyframeEffect;
            if (effect.getKeyframes().some((frame) => 'opacity' in frame)) {
              durations[face!.getAttribute('data-study-face')!] = Number(
                effect.getTiming().duration,
              );
            }
          }
          if (
            face?.getAttribute('data-study-face') === destination &&
            surface &&
            Number(getComputedStyle(surface).opacity) >= 0.9999 &&
            animations.every((animation) => animation.playState === 'finished')
          ) {
            resolve({ durations, elapsed: performance.now() - started });
          } else if (performance.now() - started > 3_000) {
            reject(new Error('The card flip did not settle.'));
          } else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      },
    );
  }, destination);
}

test('slows both flip phases, follows live speed changes and skips reduced-motion decoration', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Flip timing');
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill('Flip timing question');
  await page.getByRole('textbox', { name: 'Back' }).fill('Flip timing answer');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('[data-study-face="front"]')).toBeVisible();

  for (const [speed, phaseDuration] of [
    ['normal', 280],
    ['slow', 392],
    ['fast', 168],
  ] as const) {
    await page.evaluate((speed) => {
      localStorage.setItem('lacuna.motionSpeed', speed);
      window.dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: speed }));
    }, speed);
    for (const destination of ['back', 'front'] as const) {
      const result = await measureFlip(page, destination);
      expect(result.durations.front).toBeCloseTo(phaseDuration, 2);
      expect(result.durations.back).toBeCloseTo(phaseDuration, 2);
      expect(result.elapsed).toBeGreaterThan(phaseDuration * 1.8);
      expect(result.elapsed).toBeLessThan(phaseDuration * 2 + 350);
    }
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Let the media-query change reach React before measuring the next interaction.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  for (const destination of ['back', 'front'] as const) {
    const result = await measureFlip(page, destination);
    expect(result.durations).toEqual({});
    expect(result.elapsed).toBeLessThan(120);
  }
});
