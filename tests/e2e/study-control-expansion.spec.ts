import { expect, test } from '@playwright/test';
import { seedStudyCards } from './fixtures/studyCards';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const name of ['Exit', 'Card actions', 'Pomodoro timer']) {
    test(`${name} expands and collapses with ${reducedMotion} motion`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ reducedMotion, colorScheme: 'dark' });
      const { lessonId } = await seedStudyCards(page, 'Study expansion', [['Question', 'Answer']]);
      await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
      const trigger = page.getByRole('button', { name, exact: true });
      await expect(trigger).toBeVisible();
      const observed = await trigger.evaluate(async (button, name) => {
        if (!(button instanceof HTMLElement)) throw new Error('Expected a study button');
        const origin = button.getBoundingClientRect();
        const card = document.querySelector('[data-study-card-id]');
        const samples: { x: number; y: number; width: number; height: number }[] = [];
        button.focus();
        button.click();
        for (let frame = 0; frame < 45; frame++) {
          await new Promise(requestAnimationFrame);
          if (card && document.querySelector('[data-study-card-id]') !== card)
            throw new Error('Opening a study control replaced the stationary card');
          const panel =
            document.querySelector(
              `[role="dialog"][aria-label="${name === 'Exit' ? 'Leave this session?' : name}"]`,
            ) ??
            [...document.querySelectorAll('button')].find(
              (node) => node.textContent?.trim() === 'Edit card',
            )?.parentElement;
          if (panel) {
            const rect = panel.getBoundingClientRect();
            samples.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          }
        }
        return {
          origin: { x: origin.x, y: origin.y, width: origin.width, height: origin.height },
          samples,
        };
      }, name);
      const final = observed.samples.at(-1)!;
      expect(final.width).toBeGreaterThan(observed.origin.width + 50);
      if (reducedMotion === 'no-preference') {
        expect(
          observed.samples.some(
            (rect) => rect.width > observed.origin.width + 2 && rect.width < final.width - 2,
          ),
        ).toBe(true);
      }
      expect(Math.abs(final.y - observed.origin.y)).toBeLessThan(1);
      const panel = page.getByRole('dialog', {
        name: name === 'Exit' ? 'Leave this session?' : name,
      });
      if (name === 'Exit') {
        const stay = panel.getByRole('button', { name: 'Stay', exact: true });
        const leave = panel.getByRole('button', { name: 'Leave', exact: true });
        await leave.focus();
        await page.keyboard.press('Tab');
        await expect(stay).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(leave).toBeFocused();
      }
      await page.screenshot({
        path: info.outputPath(`${name.replaceAll(' ', '-').toLowerCase()}.png`),
      });
      // A content change must resize the same shell without scaling its text.
      if (name === 'Card actions') {
        const originalHeight = (await panel.boundingBox())!.height;
        const heights = await panel.evaluate(async (element) => {
          const first = element.querySelector('button')!;
          first.style.minHeight = `${first.offsetHeight + 80}px`;
          const heights: number[] = [];
          for (let frame = 0; frame < 45; frame++) {
            await new Promise(requestAnimationFrame);
            heights.push(element.getBoundingClientRect().height);
          }
          return heights;
        });
        expect(heights.at(-1)!).toBeGreaterThan(originalHeight + 75);
        if (reducedMotion === 'no-preference')
          expect(
            heights.some((height) => height > originalHeight + 2 && height < originalHeight + 78),
          ).toBe(true);
      }
      const [closingWidths] = await Promise.all([
        panel.evaluate(async (element) => {
          const widths: number[] = [];
          for (let frame = 0; frame < 45 && element.isConnected; frame++) {
            await new Promise(requestAnimationFrame);
            if (element.isConnected) widths.push(element.getBoundingClientRect().width);
          }
          return widths;
        }),
        page.keyboard.press('Escape'),
      ]);
      if (reducedMotion === 'no-preference')
        expect(
          closingWidths.some(
            (width) => width > observed.origin.width + 2 && width < final.width - 2,
          ),
        ).toBe(true);
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  }
}
