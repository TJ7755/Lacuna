import { expect, test } from '@playwright/test';
import { settle } from './fixtures/flowEvidence';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, serviceWorkers: 'block' });

for (const theme of ['light', 'dark']) {
  test(`qualification guidance has rounded feedback and native activation (${theme})`, async ({
    page,
  }, info) => {
    await page.addInitScript((theme) => localStorage.setItem('lacuna-theme', theme), theme);
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await page.getByRole('button', { name: 'Course library', exact: true }).click();
    const summary = page
      .locator('summary')
      .filter({ hasText: 'Not sure which qualification to choose?' });
    await settle(page.locator('.flow-expansion').filter({ has: summary }));
    await summary.hover();
    const feedback = summary.locator('.flow-feedback-layer');
    await expect(feedback).toHaveCSS('opacity', '0.045');
    await summary.locator('..').screenshot({ path: info.outputPath('qualification-hover.png') });
    await info.attach('Qualification guidance hover', {
      path: info.outputPath('qualification-hover.png'),
      contentType: 'image/png',
    });
    expect(
      await feedback.evaluate((layer) => parseFloat(getComputedStyle(layer).borderTopLeftRadius)),
    ).toBeGreaterThan(0);
    await summary.click();
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await summary.press('Space');
    await expect(summary.locator('..')).not.toHaveAttribute('open');
  });
}

test('flipping a hovered study card leaves no rectangular feedback behind', async ({
  page,
}, info) => {
  await page.goto('/#/start', { waitUntil: 'domcontentloaded' });

  const card = page
    .locator('[data-study-card-id]')
    .getByRole('button', { name: /^(Show|Hide) answer$/ });
  await card.hover();
  await card.click();

  const feedbackDuringFlip = await card.locator(':scope > .flow-feedback-layer').count();
  await info.attach('Hovered card reveal', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await expect(card.locator('[data-study-face="back"]')).toBeVisible();
  expect(feedbackDuringFlip).toBe(0);
});

test('shared feedback preserves contours through hover, press and focus', async ({ page }) => {
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
    await target.focus();
    await expect(target).toHaveCSS('border-radius', radius);
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
