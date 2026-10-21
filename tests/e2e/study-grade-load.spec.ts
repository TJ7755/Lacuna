import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

for (const firstLesson of [false, true]) {
  test(`grades promptly in ${firstLesson ? 'a new 13-card lesson' : 'a large course'}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const bundle = await build({
      entryPoints: [
        firstLesson
          ? 'tests/e2e/fixtures/studyFirstGrade.ts'
          : 'scripts/performance-heavy/fixture.ts',
      ],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'StudyLoadFixture',
      define: { 'import.meta.env.DEV': 'false' },
    });
    await page.route('**/__study_fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Study fixture</title>' }),
    );
    await page.goto('/__study_fixture');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() =>
      (
        window as unknown as { StudyLoadFixture: { seed(): Promise<unknown> } }
      ).StudyLoadFixture.seed(),
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      localStorage.setItem('lacuna.gradingMode', 'manual');
    });
    await page.goto('/#/course/heavy-course-0');
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await page
      .getByRole('region', { name: 'Session preview' })
      .getByRole('button', { name: 'Start session' })
      .first()
      .click();
    await expect(page.locator('[data-study-face="front"]')).toBeVisible();
    await page
      .getByRole('button', { name: /Show answer/i })
      .last()
      .click();
    await expect(page.locator('[data-study-face="back"]')).toBeVisible();
    await page.waitForTimeout(800);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    const elapsed = await page.getByRole('button', { name: 'Easy', exact: true }).evaluate(
      (button) =>
        new Promise<number>((resolve) => {
          const started = performance.now();
          (button as HTMLButtonElement).click();
          function sample() {
            if (document.querySelector('[data-study-face="front"]'))
              resolve(performance.now() - started);
            else if (performance.now() - started > 10_000) resolve(performance.now() - started);
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }),
    );
    const { profile } = await cdp.send('Profiler.stop');
    await testInfo.attach('grade.cpuprofile', {
      body: JSON.stringify(profile),
      contentType: 'application/json',
    });
    await testInfo.attach('grade-time.json', {
      body: JSON.stringify({ elapsed }),
      contentType: 'application/json',
    });
    await cdp.detach();
    expect(elapsed).toBeLessThan(330);
  });
}
