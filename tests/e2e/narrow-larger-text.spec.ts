import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

// Regressions for #442 and #444: at 320px with Larger text, pages must not scroll
// sideways and no information may be clipped out of reach.
async function mainOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    return main.scrollWidth - main.clientWidth;
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('lacuna-font-scale', '1.3');
    localStorage.setItem('lacuna-font-scale-user-set', '1');
  });
});

test('the sequence editor action bar stays within the page at 320px with Larger text', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  // Seeded at desktop width, where the course sidebar is visible.
  await createCourse(page, 'Narrow course');
  const courseId = new URL(page.url()).hash.split('/')[2];
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/#/course/${courseId}/sequence/new`);
  const add = page.getByRole('button', { name: 'Add sequence' });
  await expect(add).toBeVisible();
  expect(await mainOverflow(page)).toBeLessThanOrEqual(1);
  const lines = await add.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
  expect(lines, 'Add sequence fits on one line').toBe(1);
});

test('the Help shortcuts table keeps every column reachable at 320px with Larger text', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/#/help#keyboard-shortcuts');
  const region = page.getByRole('region', { name: 'Keyboard shortcuts table' });
  await region.scrollIntoViewIfNeeded();
  expect(await mainOverflow(page)).toBeLessThanOrEqual(1);
  const when = region.getByRole('columnheader', { name: 'Where' });
  await region.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  const [regionBox, whenBox] = await Promise.all([region.boundingBox(), when.boundingBox()]);
  expect(whenBox!.x + whenBox!.width).toBeLessThanOrEqual(regionBox!.x + regionBox!.width + 1);
});
