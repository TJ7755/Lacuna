import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`nested settings retain drafts and reverse continuously with ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /^Course defaults/ }).click();
    await expect(page.getByRole('button', { name: /^Advanced practice timing/ })).toBeVisible();
    const results = await page.evaluate(async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const results = [];
      for (const speed of ['fast', 'normal', 'slow'] as const) {
        localStorage.setItem('lacuna.motionSpeed', speed);
        window.dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: speed }));
        await delay(30);
        for (const title of ['Advanced scheduling', 'Advanced practice timing']) {
          const button = Array.from(document.querySelectorAll('button')).find((el) =>
            el.textContent?.startsWith(title),
          )!;
          const panel = document.getElementById(button.getAttribute('aria-controls')!)!
            .firstElementChild as HTMLElement;
          const headerHeight = button.getBoundingClientRect().height;
          button.click();
          const heights: number[] = [];
          const start = performance.now();
          while (performance.now() - start < 850) {
            await new Promise(requestAnimationFrame);
            heights.push(panel.getBoundingClientRect().height);
          }
          const input = panel.querySelector('input');
          if (input) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
              input,
              '73',
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(20);
          }
          button.click();
          await delay(80);
          const before = panel.getBoundingClientRect().height;
          const inert = panel.inert;
          button.click();
          const after = panel.getBoundingClientRect().height;
          await delay(850);
          const retainedDraft =
            !input || (panel.querySelector('input') === input && input.value === '73');
          button.click();
          await delay(850);
          results.push({
            speed,
            title,
            before,
            after,
            inert,
            retainedDraft,
            height: Math.max(...heights),
            intermediate: heights.some((height) => height > 1 && height < Math.max(...heights) - 1),
            closed: panel.getBoundingClientRect().height,
            headerDrift: button.getBoundingClientRect().height - headerHeight,
            textScale: new DOMMatrix(
              getComputedStyle(panel.querySelector('span, input')!).transform,
            ).a,
          });
        }
      }
      return results;
    });
    for (const result of results) {
      expect(result.height).toBeGreaterThan(50);
      expect(result.closed).toBe(0);
      expect(result.inert).toBe(true);
      expect(result.retainedDraft).toBe(true);
      expect(Math.abs(result.after - result.before)).toBeLessThan(1);
      expect(result.headerDrift).toBe(0);
      expect(result.textScale).toBe(1);
      if (reducedMotion === 'no-preference') expect(result.intermediate).toBe(true);
      else expect(result.before).toBe(0);
    }
  });
}
