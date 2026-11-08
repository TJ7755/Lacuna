import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('pans the Progress heatmap while the primary mouse button is held', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/analytics');
  await page.getByRole('button', { name: '30 days', exact: true }).click();

  const section = page.getByRole('region', { name: 'Review activity' });
  const grid = section.getByRole('grid', { name: 'Review activity over the last 30 days' });
  const scrollport = grid.locator('..');
  await scrollport.scrollIntoViewIfNeeded();
  await expect(scrollport).toHaveCSS('scrollbar-width', 'none');
  const scrollLeft = () => scrollport.evaluate((element) => element.scrollLeft);
  const start = await scrollLeft();
  expect(start).toBeGreaterThan(16);

  const bounds = (await scrollport.boundingBox())!;
  const x = bounds.x + bounds.width - 4;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The first drag event lands outside the scrollport.
  await page.mouse.move(x + 16, y);
  await expect.poll(scrollLeft).toBe(start - 16);
  await page.mouse.move(x, y);
  await expect.poll(scrollLeft).toBe(start);

  await page.mouse.down({ button: 'right' });
  await page.mouse.up();
  await page.mouse.move(x + 16, y);
  await page.mouse.up({ button: 'right' });
  expect(await scrollLeft()).toBe(start);

  await page.mouse.move(0, 0);
  await section.screenshot({ path: testInfo.outputPath('progress-heatmap.png') });
});
