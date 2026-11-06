import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';
import type { seed } from './fixtures/transitionPriorities';

test('A completed lesson and its priority topics keep their full names and exact due counts on desktop', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/transitionPriorities.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'TransitionFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const fixture = await page.evaluate(() =>
    (window as unknown as { TransitionFixture: { seed: typeof seed } }).TransitionFixture.seed(),
  );
  await page.goto(`/#/course/${fixture.courseId}`);
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);
  const continueNotes = page.getByRole('button', { name: 'Continue', exact: true });
  const card = page.locator('[data-study-card-id]:not([inert])');
  await expect(continueNotes.or(card)).toBeVisible();
  if (await continueNotes.isVisible()) await continueNotes.click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  const transition = page.getByRole('main', { name: 'Study progress', exact: true });
  await expect(transition).toBeVisible();
  const completed = transition.getByText(fixture.completedName, { exact: true });
  await expect(completed).toBeVisible();
  const fullyWrapped = (element: HTMLElement | SVGElement) =>
    element.scrollWidth <= element.clientWidth &&
    element.getBoundingClientRect().height > parseFloat(getComputedStyle(element).lineHeight);
  expect(await completed.evaluate(fullyWrapped)).toBe(true);
  const topics = transition.getByRole('list', { name: 'Priority topics', exact: true });
  for (const name of fixture.topicNames) {
    const topic = topics.getByText(name, { exact: true });
    await expect(topic).toBeVisible();
    expect(await topic.evaluate(fullyWrapped)).toBe(true);
    await expect(topic.locator('..').getByText('0 due', { exact: true })).toBeVisible();
  }
  const next = transition.getByRole('button', { name: /^Continue/ });
  await expect(next).toBeFocused();
  await expect(next).toBeInViewport();
  await page.mouse.move(0, 0);
  const screenshot = info.outputPath('transition-full-names-and-due-counts.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await info.attach('transition-full-names-and-due-counts', {
    path: screenshot,
    contentType: 'image/png',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await next.press('Enter');
  await expect(transition).toBeHidden();
});
