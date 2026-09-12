import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const input of ['swipe', 'keyboard'] as const) {
  for (const width of [390, 1280]) {
    for (const direction of [-1, 1]) {
      test(`${input} sends ${direction < 0 ? 'No' : 'Yes'} beyond the ${width}px viewport`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await enterFreshLacuna(page);
        await createCourse(page, 'Swipe regression');
        await page.getByRole('button', { name: 'Author mode' }).click();
        await page.getByRole('button', { name: 'New card', exact: true }).click();
        await page.getByRole('textbox', { name: 'Front' }).fill('Swipe question');
        await page.getByRole('textbox', { name: 'Back' }).fill('Swipe answer');
        await page.getByRole('button', { name: 'Add card', exact: true }).click();
        await expect(page).not.toHaveURL(/\/cards\/new$/);
        await page.getByRole('link', { name: 'Course', exact: true }).click();
        await page.getByRole('button', { name: 'Study', exact: true }).click();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.setViewportSize({ width, height: 900 });
        const front = page.locator('[data-study-face="front"]');
        await expect
          .poll(() =>
            front.evaluate((face) => {
              let opacity = 1;
              for (let node: Element | null = face; node; node = node.parentElement) {
                opacity *= Number(getComputedStyle(node).opacity);
              }
              return opacity;
            }),
          )
          .toBeGreaterThan(0.95);
        await page
          .getByRole('button', { name: /Show answer/i })
          .last()
          .click();
        const card = page
          .getByRole('button', { name: 'Hide answer', exact: true })
          .filter({ has: page.locator('[data-study-face]') });
        await expect(card.locator('[data-study-face="back"]')).toBeVisible();
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });

        if (input === 'swipe' && direction > 0 && width === 390) {
          const bounds = (await card.boundingBox())!;
          const x = bounds.x + bounds.width / 2;
          const y = bounds.y + bounds.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 100, y, { steps: 5 });
          await page.screenshot({ path: test.info().outputPath('swipe-cue.png') });
          await card.dispatchEvent('pointercancel', { pointerId: 1 });
          await page.mouse.up();
          await expect
            .poll(() =>
              card
                .locator('[data-study-face]')
                .evaluate((face) =>
                  Math.abs(
                    face.parentElement!.getBoundingClientRect().left -
                      face.closest('[role="button"]')!.getBoundingClientRect().left,
                  ),
                ),
            )
            .toBeLessThan(1);
        }

        // Sample the actual outgoing surface on every frame; disappearance or fading
        // in place must not be mistaken for travelling beyond the viewport.
        const result = await card.evaluate(
          async (element, { direction, input }) => {
            const surface = element.querySelector('[data-study-face]')!.parentElement!;
            const bounds = surface.getBoundingClientRect();
            const x = bounds.left + bounds.width / 2;
            const y = bounds.top + bounds.height / 2;
            const send = (type: string, dx: number) =>
              element.dispatchEvent(
                new PointerEvent(type, {
                  bubbles: true,
                  pointerId: 1,
                  pointerType: 'touch',
                  clientX: x + dx,
                  clientY: y,
                }),
              );
            // Synthetic pointers do not have a native capture session.
            element.setPointerCapture = () => {};
            element.releasePointerCapture = () => {};
            if (input === 'swipe') {
              send('pointerdown', 0);
              send('pointermove', direction * 100);
              await new Promise(requestAnimationFrame);
              send('pointerup', direction * 100);
            } else {
              const key = direction < 0 ? 'ArrowLeft' : 'ArrowRight';
              window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
            }
            const started = performance.now();
            return new Promise<{ offscreen: boolean; overflow: boolean }>((resolve) => {
              let overflow = false;
              function sample() {
                const rect = surface.getBoundingClientRect();
                overflow ||= document.documentElement.scrollWidth > innerWidth;
                const offscreen = direction < 0 ? rect.right <= 0 : rect.left >= innerWidth;
                if (offscreen || !surface.isConnected || performance.now() - started > 1500) {
                  resolve({ offscreen: offscreen && surface.isConnected, overflow });
                } else requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
            });
          },
          { direction, input },
        );
        expect(result.offscreen).toBe(true);
        expect(result.overflow).toBe(false);
        await expect(card).toHaveCount(0);
        if (direction < 0) {
          const next = page.locator('[data-study-face="front"]');
          await expect(next).toBeVisible();
          await expect
            .poll(() =>
              next.evaluate((face) => {
                const bounds = face.getBoundingClientRect();
                return Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2);
              }),
            )
            .toBeLessThan(1);
        }
      });
    }
  }
}
