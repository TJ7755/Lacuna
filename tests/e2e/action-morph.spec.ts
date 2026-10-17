import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`creation reveal keeps final layout bounds and capsule corners at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    await expect
      .poll(() =>
        trigger.evaluate((button) => {
          let element: Element | null = button;
          while (element) {
            const transform = getComputedStyle(element).transform;
            if (transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') return false;
            element = element.parentElement;
          }
          return true;
        }),
      )
      .toBe(true);
    const result = await trigger.evaluate(async (button) => {
      (button as HTMLButtonElement).click();
      await new Promise(requestAnimationFrame);
      const surface = button.parentElement!;
      const frames = surface
        .getAnimations()
        .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes());
      const samples = [];
      const start = performance.now();
      while (performance.now() - start < 650) {
        await new Promise(requestAnimationFrame);
        const rect = surface.getBoundingClientRect();
        samples.push({
          width: rect.width,
          height: rect.height,
          clip: getComputedStyle(surface).clipPath,
        });
      }
      return { frames, samples };
    });
    expect(result.frames.some((frame) => 'clipPath' in frame)).toBe(true);
    expect(
      result.frames.some((frame) =>
        ['width', 'height', 'left', 'top'].some((property) => property in frame),
      ),
    ).toBe(false);
    expect(new Set(result.samples.map((sample) => sample.width)).size).toBe(1);
    expect(new Set(result.samples.map((sample) => sample.height)).size).toBe(1);
    expect(result.samples.some((sample) => sample.clip !== 'none')).toBe(true);
    expect(result.samples.at(-1)?.clip).toBe('none');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}

test('first phone creation reveal preserves its trigger centre while clamping the panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await enterFreshLacuna(page);
  const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  await expect
    .poll(() =>
      trigger.evaluate((button) => {
        let element: Element | null = button;
        while (element) {
          const transform = getComputedStyle(element).transform;
          if (transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') return false;
          element = element.parentElement;
        }
        return true;
      }),
    )
    .toBe(true);
  const drift = await trigger.evaluate(async (button) => {
    const before = button.getBoundingClientRect();
    const centre = before.left + before.width / 2;
    const samples: number[] = [];
    const sample = async (duration: number) => {
      const start = performance.now();
      while (performance.now() - start < duration) {
        await new Promise(requestAnimationFrame);
        const rect = button.getBoundingClientRect();
        samples.push(Math.abs(rect.left + rect.width / 2 - centre));
      }
    };
    (button as HTMLButtonElement).click();
    await sample(650);
    const firstOpen = Math.max(...samples);
    samples.length = 0;
    for (const duration of [90, 90, 650]) {
      (button as HTMLButtonElement).click();
      await sample(duration);
    }
    return { firstOpen, reversals: Math.max(...samples) };
  });
  expect(drift.firstOpen).toBeLessThanOrEqual(2);
  expect(drift.reversals).toBeLessThanOrEqual(2);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('study prepares beneath a morphing paper blend and reveals without a blank hand-off', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const result = await page
    .getByRole('button', { name: 'Start session' })
    .evaluate(async (button) => {
      const samples = [];
      const start = performance.now();
      (button as HTMLButtonElement).click();
      while (performance.now() - start < 900) {
        await new Promise(requestAnimationFrame);
        const cover = document.querySelector('[data-testid="study-cover"]');
        const surface = cover?.lastElementChild;
        const entrance = document.querySelector('[data-study-entrance]');
        samples.push({
          time: performance.now() - start,
          cover: Boolean(cover),
          clip: surface ? getComputedStyle(surface).clipPath : null,
          opacity: surface ? Number(getComputedStyle(surface).opacity) : 0,
          ready: Boolean(entrance),
          visible: Boolean(entrance && getComputedStyle(entrance).opacity !== '0'),
        });
      }
      return samples;
    });
  expect(result.some((sample) => sample.ready && sample.cover)).toBe(true);
  expect(result.some((sample) => sample.visible && sample.opacity > 0 && sample.opacity < 1)).toBe(
    true,
  );
  expect(result.filter((sample) => !sample.cover).every((sample) => sample.visible)).toBe(true);
  expect(result.at(-1)?.cover).toBe(false);
});

test('Study opens immediately after its preview module has warmed', async ({ page }) => {
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const elapsed = await page
    .getByRole('button', { name: 'Study', exact: true })
    .evaluate(async (button) => {
      const start = performance.now();
      (button as HTMLButtonElement).click();
      while (
        !document.querySelector('[data-expanding-action="study"]') &&
        performance.now() - start < 1000
      )
        await new Promise(requestAnimationFrame);
      return performance.now() - start;
    });
  expect(elapsed).toBeLessThan(200);
});
