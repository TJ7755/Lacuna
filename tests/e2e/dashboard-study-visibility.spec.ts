import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const viewport of [
  { width: 1366, height: 600 },
  { width: 390, height: 844 },
]) {
  for (const textScale of [1, 2]) {
    test(`Study stays above the fold at ${viewport.width}px with ${textScale * 100}% text`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enterFreshLacuna(page);
      await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% !important; }` });
      const forecast = page.getByRole('region', { name: 'Forecast and this week' });
      await expect(forecast).toBeVisible();
      const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
      await expect(study).toBeVisible();
      mkdirSync('artifacts/dashboard-study', { recursive: true });
      await page.screenshot({
        path: `artifacts/dashboard-study/${testInfo.project.name}-${viewport.width}-${textScale}.png`,
      });
      const box = (await study.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      if (viewport.width === 1366 && textScale === 1) await study.click();
      else {
        await study.focus();
        await study.press('Enter');
      }
      await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
    });
  }
}
