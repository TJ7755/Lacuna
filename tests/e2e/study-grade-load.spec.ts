import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

for (const firstLesson of [false, true]) {
  for (const gesture of [false, true]) {
    test(`grades visibly via ${gesture ? 'swipe' : 'Easy'} in ${firstLesson ? 'a new 13-card lesson' : 'a large course'}`, async ({
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
      await page.evaluate(() => {
        const result = new Promise<number>((resolve) => {
          document.addEventListener(
            'pointerup',
            () => {
              const started = performance.now();
              let visibleFrames = 0;
              function sample() {
                const face = document.querySelector<HTMLElement>('[data-study-face="front"]');
                let visible = !!face;
                if (face) {
                  const bounds = face.getBoundingClientRect();
                  visible =
                    bounds.width > 0 &&
                    bounds.height > 0 &&
                    bounds.left >= 0 &&
                    bounds.right <= innerWidth &&
                    bounds.top >= 0 &&
                    bounds.bottom <= innerHeight;
                  let opacity = 1;
                  for (let node: HTMLElement | null = face; node; node = node.parentElement) {
                    const style = getComputedStyle(node);
                    opacity *= Number(style.opacity);
                    if (style.visibility === 'hidden' || style.display === 'none' || node.inert)
                      visible = false;
                  }
                  visible &&=
                    opacity >= 0.99 &&
                    Array.from(face.querySelectorAll('img')).every(
                      (image) => image.complete && image.naturalWidth > 0,
                    );
                }
                visibleFrames = visible ? visibleFrames + 1 : 0;
                if (visibleFrames >= 2 || performance.now() - started > 10_000)
                  resolve(performance.now() - started);
                else requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
            },
            { once: true, capture: true },
          );
        });
        (window as unknown as { gradeVisible: Promise<number> }).gradeVisible = result;
      });
      if (gesture) {
        const bounds = (await page.locator('[data-study-face="back"]').boundingBox())!;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 400, y, { steps: 12 });
        await page.mouse.up();
      } else {
        await page.getByRole('button', { name: 'Easy', exact: true }).click();
      }
      const elapsed = await page.evaluate(
        () => (window as unknown as { gradeVisible: Promise<number> }).gradeVisible,
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
      expect(elapsed).toBeLessThan(650);
    });
  }
}
