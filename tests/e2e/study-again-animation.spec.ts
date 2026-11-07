import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Again gains its red surface before the liquid hands back (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Again animation');
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front' }).fill('Which organ produces bile?');
    await page.getByRole('textbox', { name: 'Back' }).fill('The liver.');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.evaluate(() => localStorage.setItem('lacuna.gradingMode', 'manual'));
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Course sections' })
      .getByRole('link', { name: 'Path', exact: true })
      .click();
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    const reveal = page.getByRole('button', { name: 'Show answer', exact: true }).last();
    await expect(reveal).toBeVisible();
    const liquid = page.locator('[data-flow-layer]');
    const negative = liquid.locator('[data-flow-negative]');
    if (reducedMotion === 'no-preference') {
      const frames = await reveal.evaluate((button) => {
        const liquid = document.querySelector('[data-flow-layer]')!;
        const negative = liquid.querySelector('[data-flow-negative]')!;
        return new Promise<{ opacity: number; flowing: boolean }[]>((resolve) => {
          const frames: { opacity: number; flowing: boolean }[] = [];
          const started = performance.now();
          (button as HTMLButtonElement).click();
          const sample = () => {
            const flowing = !liquid.classList.contains('invisible');
            frames.push({ opacity: Number(getComputedStyle(negative).opacity), flowing });
            if ((!flowing && frames.length > 1) || performance.now() - started > 1500)
              resolve(frames);
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
      });
      expect(frames.some(({ opacity, flowing }) => flowing && opacity > 0 && opacity < 1)).toBe(
        true,
      );
      expect(frames.some(({ opacity, flowing }) => flowing && opacity === 1)).toBe(true);
    } else await reveal.click();
    await expect(liquid).toHaveClass(/invisible/);
    await expect(page.getByRole('button', { name: 'Again', exact: true })).toBeVisible();
    // Its animated outline and surface match the button that replaces them.
    const colours = await negative.evaluate((node) => {
      const button = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Again',
      )!;
      const flood = document.querySelector(
        `[id="${node.getAttribute('filter')!.slice(5, -1)}"] feFlood`,
      )!;
      const paper = getComputedStyle(document.body).backgroundColor;
      const colour = (value: string) => {
        const context = document.createElement('canvas').getContext('2d')!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      return {
        surface: colour(getComputedStyle(node).fill),
        paper: colour(paper),
        outline: colour(getComputedStyle(flood).floodColor),
        border: colour(getComputedStyle(button).borderColor),
      };
    });
    expect(colours.surface).toEqual(colours.paper);
    expect(colours.outline).toEqual(colours.border);
    for (const name of ['Hard', 'Good', 'Easy']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const screenshot = testInfo.outputPath('again-settled.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('Again settled', { path: screenshot, contentType: 'image/png' });
    const acknowledgement = await page.getByRole('button', { name: 'Again', exact: true }).evaluate(
      (button) =>
        new Promise<{ rim: boolean; fill: boolean }>((resolve) => {
          let rim = false,
            fill = false;
          const start = performance.now();
          const nativeOpacity = (selector: string) =>
            [...document.querySelectorAll(selector)].some((node) =>
              node
                .getAnimations()
                .some(
                  (animation) =>
                    animation.effect instanceof KeyframeEffect &&
                    animation.effect.getKeyframes().some((frame) => frame.opacity !== undefined),
                ),
            );
          (button as HTMLButtonElement).click();
          const sample = () => {
            rim ||= nativeOpacity('[data-study-rim]');
            fill ||= nativeOpacity('[data-study-grade-fill]');
            if (performance.now() - start < 600) requestAnimationFrame(sample);
            else resolve({ rim, fill });
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(acknowledgement).toEqual({
      rim: reducedMotion === 'no-preference',
      fill: reducedMotion === 'no-preference',
    });
    await expect(page.locator('[data-study-face="back"]')).toHaveCount(0);
  });
}
