import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('existing appearance buttons work without additional controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/settings');
  const accents = page.getByRole('radiogroup', { name: 'Accent colour' });
  await accents.getByRole('radio', { name: 'Amber', exact: true }).click();
  await expect(accents.getByRole('radio', { name: 'Amber', exact: true })).toBeChecked();
  const motion = page.getByRole('radiogroup', { name: 'Animation speed' });
  await expect(motion.getByRole('radio')).toHaveCount(3);
  await expect(motion.getByRole('radio', { name: 'Off', exact: true })).toHaveCount(0);
  await motion.getByRole('radio', { name: 'Slow', exact: true }).click();
  await expect(page.getByLabel('About input controls')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('settings-original-controls.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(motion.getByRole('radio', { name: 'Slow', exact: true })).toBeChecked();
  await page.goto('/#/');
  await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
  const field = page
    .getByRole('form', { name: 'New course' })
    .getByRole('textbox', { name: 'Course name' });
  await field.evaluate((element) => element.blur());
  await expect(field).toHaveValue('');
  await page.screenshot({
    path: testInfo.outputPath('field-boundary.png'),
    animations: 'disabled',
  });
});

test('existing Help result buttons collapse and reopen without extra guidance', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/help');
  await page.getByRole('searchbox', { name: 'Search help' }).fill('PICTURE sharing');
  const topic = page.getByRole('button', { name: 'How do I share a diagram with its image?' });
  await topic.click();
  await expect(topic).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status').filter({ hasText: /matching topic/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('help-search-collapsed.png'),
    animations: 'disabled',
  });
  await topic.click();
  await expect(topic).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({
    path: testInfo.outputPath('help-search-open.png'),
    animations: 'disabled',
  });
  // Open the existing palette only to verify that its new hint UI is gone.
  for (let opening = 0; opening < 2; opening += 1) {
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Quick search' });
    await expect(palette.locator('kbd')).toHaveCount(0);
    await expect(palette.getByText('Navigate', { exact: true })).toHaveCount(0);
    if (opening === 1)
      await page.screenshot({
        path: testInfo.outputPath('quick-search-no-hints.png'),
        animations: 'disabled',
      });
    await palette.locator('[data-modal-backdrop]').click({ position: { x: 2, y: 2 } });
    await expect(palette).toBeHidden();
  }
});
