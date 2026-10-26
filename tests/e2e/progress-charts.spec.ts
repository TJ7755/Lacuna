import { expect, test, type Page } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

async function chartCard(page: Page, title: string) {
  const heading = page.getByText(title, { exact: true }).first();
  await heading.scrollIntoViewIfNeeded();
  return heading.locator('xpath=ancestor::*[.//*[contains(@class,"recharts-surface")]][1]');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
});

test('Workload ahead draws each day as a bar', async ({ page }) => {
  await page.goto('/#/analytics');
  const card = await chartCard(page, 'Workload ahead');
  // A line across daily counts spiked against the axis when a course was all new cards.
  await expect(card.locator('.recharts-surface')).toBeVisible();
  await expect.poll(() => card.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
  await expect(card.locator('.recharts-area')).toHaveCount(0);
});

test('Lesson breakdown keeps card counts off the percentage axis', async ({ page }) => {
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/analytics`);
  const card = await chartCard(page, 'Lesson breakdown');
  await expect(card.locator('.recharts-bar').first()).toBeAttached();
  // Counts were a dotted line on a hidden second axis, read against the percentages.
  await expect(card.locator('.recharts-line')).toHaveCount(0);
  await expect(card.locator('.recharts-yAxis')).toHaveCount(1);

  const plot = (await card.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(plot.x + 80, plot.y + plot.height / 2);
  const tooltip = card.locator('.recharts-tooltip-wrapper');
  await expect(tooltip).toContainText(/ · \d+ cards?/);
  // Rows follow the legend's order rather than the alphabet.
  const text = (await tooltip.textContent()) ?? '';
  const recallAt = text.indexOf('Predicted recall');
  expect(recallAt).toBeGreaterThanOrEqual(0);
  expect(recallAt).toBeLessThan(text.indexOf('Completion'));
});

test('Progress reading surfaces remain visible after their entrance settles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/analytics');
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeAttached();
  const settled = await page.evaluate(async () => {
    const elements = [
      document.querySelector('h1'),
      document.querySelector('[aria-label="Summary"]'),
      document.querySelector('[aria-label="Review activity"]'),
    ];
    const seen = elements.map(() => false);
    const fadedAfterArrival = elements.map(() => false);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        elements.forEach((element, index) => {
          let opacity = 1;
          for (let node = element; node; node = node.parentElement)
            opacity *= Number(getComputedStyle(node).opacity);
          if (seen[index] && opacity < 0.95) fadedAfterArrival[index] = true;
          if (element && opacity > 0.99) seen[index] = true;
        });
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return { seen, fadedAfterArrival };
  });
  expect(settled.seen).toEqual([true, true, true]);
  expect(settled.fadedAfterArrival).toEqual([false, false, false]);
});
