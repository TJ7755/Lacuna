import { expect, test, type Locator } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('Tab leaves Other ways from its trigger in both directions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Other ways to study' });
  for (const [key, target] of [
    ['Tab', 'Add'],
    ['Shift+Tab', 'Study'],
  ] as const) {
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeVisible();
    await page.keyboard.press(key);
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeHidden();
    await expect(page.getByRole('button', { name: target, exact: true })).toBeFocused();
  }
});

async function assertPanelContained(trigger: Locator, menu: Locator) {
  const panel = (await menu.boundingBox())!;
  const surface = (await trigger.locator('..').boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(surface.x - 1);
  expect(panel.y).toBeGreaterThanOrEqual(surface.y - 1);
  expect(panel.x + panel.width).toBeLessThanOrEqual(surface.x + surface.width + 1);
  expect(panel.y + panel.height).toBeLessThanOrEqual(surface.y + surface.height + 1);
}

for (const width of [390, 1440]) {
  test(`Add and Other ways share accessible expanding surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterWithWelcomeCourse(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    for (const label of ['Add', 'Other ways to study']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await expect(trigger).toBeVisible();
      const closedFont = await trigger.evaluate((element) => getComputedStyle(element).fontSize);
      const closed = (await trigger.locator('..').boundingBox())!;
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      const menu = page.getByRole('menu', { name: label, exact: true });
      const enabled = menu.locator('[role="menuitem"]:not(:disabled)');
      await expect(menu).toBeVisible();
      await expect(enabled.first()).toBeFocused();
      await assertPanelContained(trigger, menu);
      const opened = (await trigger.locator('..').boundingBox())!;
      expect(Math.abs(opened.x + opened.width - closed.x - closed.width)).toBeLessThanOrEqual(1);
      expect(await trigger.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        closedFont,
      );
      expect(opened.height).toBeGreaterThan(closed.height);
      expect(opened.x).toBeGreaterThanOrEqual(0);
      expect(opened.x + opened.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('End');
      await expect(enabled.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(enabled.first()).toBeFocused();
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${label.replaceAll(' ', '-')}-${width}.png`),
      });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });
}
