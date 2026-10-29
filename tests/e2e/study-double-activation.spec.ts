import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const scenario of [
  { name: 'plain desktop', junk: false, width: 1280, reduced: false },
  { name: 'original junk content', junk: true, width: 1280, reduced: false },
  { name: 'reduced motion', junk: false, width: 1280, reduced: true },
  { name: 'narrow layout', junk: true, width: 390, reduced: false },
]) {
  test(`requires deliberate grading through repeated study: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
    await enterFreshLacuna(page);
    await createCourse(page, 'Study activation');
    const lessonId = page.url().split('/').at(-1);
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page
      .getByRole('textbox', { name: 'Front' })
      .fill(
        scenario.junk
          ? 'BREAKER junk <script>alert(1)</script> ??? '.repeat(20)
          : 'Recall question',
      );
    await page
      .getByRole('textbox', { name: 'Back' })
      .fill(scenario.junk ? 'Literal answer: <b>not markup</b> && NULL' : 'Recall answer');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.setViewportSize({ width: scenario.width, height: 800 });
    await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);

    for (let pass = 1; pass <= 2; pass++) {
      const reveal = page.getByRole('button', { name: 'Show answer', exact: true }).last();
      await expect(reveal).toBeVisible();
      await reveal.dblclick();
      // Observe beyond the flip/departure window before allowing a deliberate grade.
      await page.waitForTimeout(1200);
      const answer = page.locator('[data-study-face="back"]');
      await expect(answer).toBeVisible();
      await expect(answer).toContainText(
        scenario.junk ? 'Literal answer: not markup && NULL' : 'Recall answer',
      );
      await expect(page.getByRole('main', { name: 'Session report' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`pass-${pass}-after-reveal.png`) });
      const yes = page.getByRole('button', { name: 'Yes', exact: true });
      if (scenario.reduced) await yes.press('Enter');
      else await yes.click();
      await expect(page.getByRole('heading', { name: 'Goal reached.' })).toBeVisible();
      if (pass === 1)
        await page.getByRole('button', { name: 'Keep studying', exact: true }).click();
    }
    await page.screenshot({ path: testInfo.outputPath('final-report.png') });
  });
}
