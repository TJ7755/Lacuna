import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ video: 'on' });

type MorphFrame = {
  surface: number;
  content: number;
  labelX: number;
  labelY: number;
};

for (const width of [390, 1470]) {
  test(`course creation grows around its pinned label at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 956 });
    await enterFreshLacuna(page);
    const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    const surface = trigger.locator('..');
    // Finish Today's arrival before measuring the creation animation itself.
    await trigger.evaluate(
      (button) =>
        new Promise<void>((resolve) => {
          let previous = '';
          let stable = 0;
          const sample = () => {
            const rect = button.getBoundingClientRect();
            const geometry = [rect.x, rect.y, rect.width, rect.height].join(',');
            stable = geometry === previous ? stable + 1 : 0;
            previous = geometry;
            if (stable >= 4) resolve();
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
    );
    const origin = await trigger.evaluate((button) => {
      const rect = button.lastElementChild!.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    const sampleTransition = () =>
      surface.evaluate(
        (element) =>
          new Promise<MorphFrame[]>((resolve) => {
            const frames: MorphFrame[] = [];
            let samples = 0;
            const sample = () => {
              const content = element.querySelector('form');
              if (content) {
                const label = element
                  .querySelector('button')!
                  .lastElementChild!.getBoundingClientRect();
                frames.push({
                  surface: element.getBoundingClientRect().width,
                  content: content.getBoundingClientRect().width,
                  labelX: label.x,
                  labelY: label.y,
                });
              }
              if (++samples >= 60 || (!content && frames.length > 0)) resolve(frames);
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }),
      );
    const openingFrames = sampleTransition();
    await trigger.click();
    const opening = await openingFrames;
    const form = page.getByRole('form', { name: 'New course' });
    const restingWidth = (await form.boundingBox())!.width;
    await expect(form.getByRole('textbox', { name: 'Course name' })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`course-open-${width}.png`) });
    const closingFrames = sampleTransition();
    await trigger.click();
    const closing = await closingFrames;
    await test.info().attach('morph-frames', {
      body: JSON.stringify({ origin, restingWidth, opening, closing }),
      contentType: 'application/json',
    });
    for (const frames of [opening, closing]) {
      expect(frames.some((frame) => frame.surface > 160 && frame.surface < restingWidth - 8)).toBe(
        true,
      );
      expect(
        Math.max(...frames.map((frame) => Math.abs(frame.content - restingWidth))),
      ).toBeLessThan(1);
      expect(
        Math.max(
          ...frames.map((frame) => Math.hypot(frame.labelX - origin.x, frame.labelY - origin.y)),
        ),
      ).toBeLessThan(1.5);
    }
    await expect(form).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
