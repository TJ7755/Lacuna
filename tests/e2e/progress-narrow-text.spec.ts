import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

// Regression for #453: the daily review strip thins its date labels to the space it has,
// so they never collide at 320px with Larger text.
test('When you studied date labels never overlap at 320px with Larger text', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lacuna-font-scale', '1.3');
    localStorage.setItem('lacuna-font-scale-user-set', '1');
  });
  await enterFreshLacuna(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/#/analytics');
  const grid = page.getByRole('grid', { name: /Review activity over the last/ });
  for (const period of ['7 days', '30 days']) {
    await page.getByRole('button', { name: period, exact: true }).click();
    await expect(grid).toHaveAttribute('aria-label', `Review activity over the last ${period}`);
    const overlaps = await grid.evaluate((element) => {
      const labels = [...element.querySelectorAll<HTMLElement>(':scope > span[aria-hidden]')]
        .map((label) => label.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      return labels.slice(1).filter((box, index) => box.left < labels[index].right + 2).length;
    });
    expect(overlaps, `${period} labels overlap`).toBe(0);
  }
});
