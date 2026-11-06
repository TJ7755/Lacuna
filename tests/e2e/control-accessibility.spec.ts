import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('settings controls remain keyboard accessible with an explicit motion Off choice', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await page.goto('/#/settings');
  const accents = page.getByRole('radiogroup', { name: 'Accent colour' });
  const volt = accents.getByRole('radio', { name: 'Volt' });
  await volt.click();
  await volt.press('ArrowRight');
  await expect(accents.getByRole('radio', { name: 'Amber' })).toBeFocused();
  await expect(accents.locator('[tabindex="0"]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByLabel('About input controls').click();
  await expect(
    page.getByText('Keyboard hints or touch gestures. Auto follows your device.'),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('settings-control-access.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Off', exact: true })).toBeChecked();
});

test('help matches can collapse and quick-search guidance remains available', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await page.goto('/#/help');
  await page.getByRole('searchbox', { name: 'Search help' }).fill('PICTURE sharing');
  const topic = page.getByRole('button', { name: 'How do I share a diagram with its image?' });
  await topic.click();
  await expect(topic).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status').filter({ hasText: /matching topic/ })).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('help-search-collapse.png'),
    animations: 'disabled',
  });
  for (let opening = 0; opening < 2; opening += 1) {
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Quick search' });
    await expect(palette.getByText('Navigate')).toBeVisible();
    if (opening === 1)
      await page.screenshot({
        path: testInfo.outputPath('quick-search-hints.png'),
        animations: 'disabled',
      });
    await page.keyboard.press('Escape');
  }
});
