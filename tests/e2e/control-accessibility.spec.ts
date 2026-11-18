import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('appearance choices persist after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/settings');
  const accents = page.getByRole('radiogroup', { name: 'Accent colour' });
  await accents.getByRole('radio', { name: 'Amber', exact: true }).click();
  await expect(accents.getByRole('radio', { name: 'Amber', exact: true })).toBeChecked();
  const motion = page.getByRole('radiogroup', { name: 'Animation speed' });
  await motion.getByRole('radio', { name: 'Slow', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('settings-original-controls.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(motion.getByRole('radio', { name: 'Slow', exact: true })).toBeChecked();
});

test('Help search results collapse and reopen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/help');
  await page.getByRole('searchbox', { name: 'Search help' }).fill('PICTURE sharing');
  const topic = page.getByRole('button', { name: 'How do I share a diagram with its image?' });
  await topic.click();
  await expect(topic).toHaveAttribute('aria-expanded', 'false');
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
});
