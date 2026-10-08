import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

// Sample every control (2px allows the press spring's overshoot) in the single-lesson header, which
// holds the "Add to path" group beside Study, across animation frames.
async function sampleButtonHeights(page: Page, frames: number) {
  return page.evaluate(async (count) => {
    const group = document
      .querySelector('[role="group"][aria-label="Add to path"]')
      ?.closest('header');
    const heights: number[][] = [];
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise(requestAnimationFrame);
      heights.push(
        [...(group?.querySelectorAll('button') ?? [])]
          .filter((button) => button.getBoundingClientRect().width > 0)
          .map((button) => button.getBoundingClientRect().height),
      );
    }
    return heights;
  }, frames);
}

for (const { width, reducedMotion } of [
  { width: 1280, reducedMotion: 'no-preference' as const },
  { width: 390, reducedMotion: 'reduce' as const },
]) {
  test(`single-lesson Add controls keep their height at ${width}px (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Toolbar course');
    await page.setViewportSize({ width, height: 900 });
    const group = page.getByRole('group', { name: 'Add to path' });
    // The Add menu belongs to the lesson header, never on a row of its own above the title.
    const title = page.getByRole('heading', { level: 1, name: 'Lesson 1' });
    expect((await group.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await title.boundingBox())!.y - 24,
    );
    const closed = await sampleButtonHeights(page, 1);
    const closedMax = Math.max(...closed[0]);
    expect(closedMax).toBeLessThanOrEqual(48);
    const fontSize = await group
      .getByRole('button')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize);

    const add = group.getByRole('button', { name: 'Add', exact: true });
    await add.click();
    await page.getByRole('menuitem', { name: 'Lesson', exact: true }).click();
    const opening = await sampleButtonHeights(page, 30);
    const name = page.getByRole('textbox', { name: 'Lesson name' });
    await expect(name).toBeFocused();
    const settled = await sampleButtonHeights(page, 1);
    for (const heights of [...opening, ...settled])
      for (const height of heights) expect(height).toBeLessThanOrEqual(closedMax + 2);
    expect(
      await group
        .getByRole('button')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe(fontSize);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );

    await page.keyboard.press('Escape');
    await expect(name).toBeHidden();
    await expect(add).toBeFocused();
    for (const heights of await sampleButtonHeights(page, 20))
      for (const height of heights) expect(height).toBeLessThanOrEqual(closedMax + 2);
  });
}

test('the Add surface grows with enlarged text instead of clipping its label', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Large text course');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const add = page
    .getByRole('group', { name: 'Add to path' })
    .getByRole('button', { name: 'Add', exact: true });
  await expect
    .poll(async () => {
      const [button, surface] = await Promise.all([
        add.boundingBox(),
        add.locator('..').boundingBox(),
      ]);
      return (
        button!.height <= surface!.height + 1 &&
        button!.width <= surface!.width + 1 &&
        button!.x >= surface!.x - 1
      );
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
