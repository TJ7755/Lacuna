import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

for (const answer of ['manual', 'automatic-advance', 'automatic-undo'] as const) {
  test(`real course flow advances after ${answer}`, async ({ page }, testInfo) => {
    await page.route('**/api/ai/session', (route) =>
      route.fulfill({
        json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 },
      }),
    );
    await page.route('**/api/ai/jev', (route) =>
      route.fulfill({
        json: {
          model: 'jev-1.14.0',
          inputTokens: 100,
          value: 1,
          confidence: 0.99,
          feedback: { kind: 'same', parts: [] },
        },
      }),
    );
    await enterFreshLacuna(page);
    const bundle = await build({
      entryPoints: ['tests/e2e/fixtures/reportContinuation.ts'],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'ReportFixture',
      define: { 'import.meta.env.DEV': 'false' },
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const courseId = await page.evaluate(
      (automatic) =>
        (
          window as unknown as { ReportFixture: { seed(automatic: boolean): Promise<string> } }
        ).ReportFixture.seed(automatic),
      answer !== 'manual',
    );
    await page.reload();
    await page.goto(`/#/course/${courseId}`);
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    const report = page.getByRole('main', { name: 'Session report' });
    const transition = page.getByRole('main', { name: 'Study progress' });
    if (answer === 'manual') {
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
    } else {
      await page.getByRole('textbox', { name: 'Your answer' }).fill('Crimson');
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      const studyCard = page.getByRole('main', { name: 'Study card' });
      const undo = page
        .getByLabel('Notifications')
        .getByRole('button', { name: 'Undo', exact: true });
      await expect(undo).toBeVisible();
      await expect(studyCard.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
      const answerFace = studyCard.locator(
        '[data-study-card-id]:not([inert]) [data-study-face="back"]',
      );
      await expect(answerFace).toBeInViewport();
      await expect(answerFace.getByText('Right, in your own words')).toBeVisible();
      await expect(report).toBeHidden();
      await expect(transition).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('provisional-card.png'), fullPage: true });
      if (answer === 'automatic-undo') {
        await undo.click();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
      }
    }
    await expect(transition).toBeVisible({ timeout: 10_000 });
    await expect(report).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('course-handoff.png'), fullPage: true });
    await transition.getByRole('button', { name: 'Finish for now' }).click();
    await expect(page).toHaveURL(new RegExp(`/#/course/${courseId}$`));
  });
}
