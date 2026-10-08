import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function chartCard(page: Page, title: string) {
  const heading = page.getByText(title, { exact: true }).first();
  await heading.scrollIntoViewIfNeeded();
  return heading.locator('xpath=ancestor::*[.//*[contains(@class,"recharts-surface")]][1]');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
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
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
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
  expect(text.indexOf('Mastery')).toBeLessThan(text.indexOf('Completion'));
});
