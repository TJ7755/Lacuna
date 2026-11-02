import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

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
