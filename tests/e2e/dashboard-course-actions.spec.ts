import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('course actions work on first use after going offline', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'More for Welcome to Lacuna' }).click();
    const archive = page.getByRole('menuitem', { name: 'Archive', exact: true });
    await expect(archive).toBeFocused();
    await archive.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Archive Welcome to Lacuna?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'More for Welcome to Lacuna' })).toBeFocused();
  } finally {
    await context.setOffline(false);
  }
});

for (const width of [390, 1440]) {
  test(`Today course actions preserve keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const queue = page.getByRole('region', { name: 'Today, most urgent first' });
    const course = queue.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    const more = queue.getByRole('button', { name: 'More for Welcome to Lacuna' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await course.focus();
    await course.press('Shift+F10');
    const archive = page.getByRole('menuitem', { name: 'Archive', exact: true });
    await expect(archive).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const target = await archive.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await archive.press('Shift+Tab');
    await expect(archive).toBeHidden();
    await expect(queue.getByRole('button', { name: 'Start Welcome to Lacuna' })).toBeFocused();
    await course.click({ button: 'right' });
    await expect(archive).toBeFocused();
    await archive.press('Escape');
    await expect(more).toBeFocused();
    await more.press('Enter');
    await archive.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Archive Welcome to Lacuna?' })).toBeVisible();
    await page.getByRole('button', { name: 'Archive course', exact: true }).click();
    await expect(course).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'No active courses' })).toBeVisible();
  });

  test(`Sidebar ordering targets fit enlarged text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const buttons = page.locator('#settings-sidebar').getByRole('button', { name: /^Move / });
    await expect(buttons).toHaveCount(12);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      const row = await button.locator('..').locator('..').boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(row!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(row!.x + row!.width);
    }
    for (const toggle of await page
      .locator('#settings-sidebar')
      .getByRole('switch', { name: /^Show / })
      .all()) {
      const box = await toggle.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const down = page.getByRole('button', { name: 'Move Today down', exact: true });
    await down.focus();
    await down.press('Enter');
    await expect(page.getByRole('button', { name: 'Move Today up', exact: true })).toBeEnabled();
  });
}
