import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

for (const answer of ['manual', 'automatic-continue', 'automatic-undo'] as const) {
  test(`real course flow advances after ${answer}`, async ({ page }, testInfo) => {
    await enterFreshLacuna(page);
    const bundle = await build({
      entryPoints: ['tests/e2e/fixtures/reportContinuation.ts'],
      bundle: true, write: false, platform: 'browser', format: 'iife',
      globalName: 'ReportFixture', define: { 'import.meta.env.DEV': 'false' },
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const courseId = await page.evaluate((automatic) =>
      (window as unknown as { ReportFixture: { seed(automatic: boolean): Promise<string> } })
        .ReportFixture.seed(automatic), answer !== 'manual');
    await page.goto(`/#/course/${courseId}`);
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    const report = page.getByRole('main', { name: 'Session report' });
    const transition = page.getByRole('main', { name: 'Study progress' });
    if (answer === 'manual') {
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
    } else {
      await page.getByRole('textbox', { name: 'Your answer' }).fill('Red');
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      await expect(report).toBeVisible();
      await expect(transition).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('provisional-report.png'), fullPage: true });
      if (answer === 'automatic-undo') {
        await report.getByRole('button', { name: 'Undo last answer' }).click();
        await expect(report).toBeHidden();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
      } else {
        await report.getByRole('button', { name: 'Continue', exact: true }).click();
      }
    }
    await expect(transition).toBeVisible();
    await expect(report).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('course-handoff.png'), fullPage: true });
    await transition.getByRole('button', { name: 'Finish for now' }).click();
    await expect(page).toHaveURL(new RegExp(`/#/course/${courseId}$`));
  });
}
