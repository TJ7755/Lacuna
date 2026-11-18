import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, serviceWorkers: 'block' });

test('shared feedback preserves contours through hover and press', async ({ page }) => {
  await enterFreshLacuna(page);
  // Exercise the installed document-level feedback owner with both unstyled and
  // explicitly shaped controls, without depending on unrelated page content.
  await page.evaluate(() => {
    const fixtures = document.createElement('div');
    fixtures.id = 'feedback-contours';
    fixtures.style.cssText =
      'position:fixed;left:400px;top:200px;z-index:9999;display:flex;gap:20px';
    for (const [name, radius] of [
      ['Plain', ''],
      ['Square', '0px'],
      ['Pill', '999px'],
      ['Asymmetric', '4px 12px 20px 0px'],
    ]) {
      const button = document.createElement('button');
      button.textContent = name;
      button.style.cssText = `width:120px;height:48px;border-radius:${radius}`;
      fixtures.append(button);
    }
    document.body.append(fixtures);
  });
  for (const name of ['Plain', 'Square', 'Pill', 'Asymmetric']) {
    const target = page.locator('#feedback-contours').getByRole('button', { name, exact: true });
    const radius = await target.evaluate((element) => getComputedStyle(element).borderRadius);
    if (name === 'Plain') expect(parseFloat(radius)).toBeGreaterThan(0);
    await target.hover();
    const feedback = target.locator('.flow-feedback-layer');
    await expect(feedback).toHaveCSS('border-radius', radius);
    await page.mouse.down();
    await expect(feedback).toHaveCSS('border-radius', radius);
    await page.mouse.up();
  }
});

for (const theme of ['light', 'dark']) {
  test(`held course tabs and the new-course trigger have no inset outline (${theme})`, async ({
    page,
  }, info) => {
    await page.addInitScript((theme) => localStorage.setItem('lacuna-theme', theme), theme);
    await enterFreshLacuna(page);
    const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    await trigger.hover();
    await page.mouse.down();
    const feedback = trigger.locator('.flow-feedback-layer');
    await expect(feedback).toHaveCSS('box-shadow', 'none');
    await page.mouse.up();
    await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(feedback).toHaveCount(0, { timeout: 300 });
    await page.screenshot({ path: info.outputPath('new-course-open.png') });
    await info.attach('New course without a lingering outline', {
      path: info.outputPath('new-course-open.png'),
      contentType: 'image/png',
    });
    await page.getByRole('textbox', { name: 'Course name', exact: true }).press('Escape');
    await expect(trigger).toBeFocused();
    await createCourse(page, 'Interaction feedback', false);

    const navigation = page.locator('nav[aria-label="Course sections"]:visible');
    const cards = navigation.getByRole('link', { name: 'Cards', exact: true });
    await cards.hover();
    await page.mouse.down();
    const heldFeedback = cards.locator('.flow-feedback-layer');
    await expect(heldFeedback).toHaveCSS('box-shadow', 'none');
    await expect(page).not.toHaveURL(/\/cards$/);
    await navigation.screenshot({ path: info.outputPath('course-tab-held.png') });
    await info.attach('Held course tab without an inset outline', {
      path: info.outputPath('course-tab-held.png'),
      contentType: 'image/png',
    });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/cards$/);
    await cards.press('ArrowRight');
    const questions = navigation.getByRole('link', { name: 'Questions', exact: true });
    await expect(questions).toBeFocused();
    await expect(questions).not.toHaveCSS('box-shadow', 'none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await cards.hover();
    await page.mouse.down();
    await expect(cards.locator('.flow-feedback-layer')).toHaveCSS('box-shadow', 'none');
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(cards.locator('.flow-feedback-layer')).toHaveCount(0);
  });
}
