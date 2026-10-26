import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ video: 'on' });

for (const width of [390, 1470]) {
  test(`course fields keep their resting width throughout the morph at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 956 });
    await enterFreshLacuna(page);
    const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    const surface = trigger.locator('..');
    const sampleTransition = () =>
      surface.evaluate(
        (element) =>
          new Promise<{ surface: number; content: number }[]>((resolve) => {
            const frames: { surface: number; content: number }[] = [];
            let samples = 0;
            const sample = () => {
              const content = element.querySelector('form');
              if (content) {
                frames.push({
                  surface: element.getBoundingClientRect().width,
                  content: content.getBoundingClientRect().width,
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
      body: JSON.stringify({ restingWidth, opening, closing }),
      contentType: 'application/json',
    });
    for (const frames of [opening, closing]) {
      expect(frames.some((frame) => frame.surface > 160 && frame.surface < restingWidth - 8)).toBe(
        true,
      );
      expect(
        Math.max(...frames.map((frame) => Math.abs(frame.content - restingWidth))),
      ).toBeLessThan(1);
    }
    await expect(form).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
