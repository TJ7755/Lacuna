import { expect, test } from '@playwright/test';
import { enterFreshLacuna, importWelcomeCourse } from './fixtures/lacunaApp';
import {
  FLOW_EVIDENCE as evidence,
  contentRect,
  opaquePixel,
  setDark,
  settle,
  upperEdge,
} from './fixtures/flowEvidence';

test.use({
  serviceWorkers: 'block',
  viewport: { width: 1470, height: 956 },
  colorScheme: 'light',
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  video: { mode: 'on', size: { width: 1470, height: 956 } },
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/films/')
      ? route.continue()
      : route.fulfill({ status: 204, body: '' });
  });
});

for (const theme of ['light', 'dark']) {
  test(`mouse feedback bends a local edge and preserves paint/content in ${theme}`, async ({
    page,
  }, info) => {
    await enterFreshLacuna(page);
    await importWelcomeCourse(page);
    if (theme === 'dark') await setDark(page);
    const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
    await settle(study);
    const label = await contentRect(study);
    const target = await study.boundingBox();
    await study.hover();
    await page.waitForTimeout(350);
    const hoverEdge = await upperEdge(await study.screenshot());
    expect(hoverEdge[1] - (hoverEdge[0] + hoverEdge[2]) / 2).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `${evidence}/study-hover-${theme}.png` });
    await page.mouse.down();
    await page.waitForTimeout(220);
    expect(await contentRect(study)).toEqual(label);
    expect(await study.boundingBox()).toEqual(target);
    const pressed = await study.screenshot();
    const edge = await upperEdge(pressed);
    expect(edge[1] - (edge[0] + edge[2]) / 2).toBeGreaterThanOrEqual(2);
    await info.attach('painted-edge', {
      body: JSON.stringify(edge),
      contentType: 'application/json',
    });
    await page.screenshot({ path: `${evidence}/study-held-${theme}.png` });
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await page.waitForTimeout(60);
    await study.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);
    await upperEdge(await study.screenshot()); // Reverse -> press keeps actual primary paint.
    await page.mouse.move(0, 0);
    await page.mouse.up();

    const row = study.locator('..');
    const title = row.getByRole('button', { name: 'Welcome to Lacuna', exact: true });
    await page.waitForTimeout(700);
    const restingRow = await row.screenshot();
    await title.hover();
    await page.waitForTimeout(350);
    const dot = row.locator(':scope > span').first();
    const learning = row.getByText('New learning', { exact: true });
    const rowBounds = (await row.boundingBox())!,
      titleBounds = (await title.boundingBox())!;
    const hoverRow = await row.screenshot();
    const textBackground = await opaquePixel(
      hoverRow,
      titleBounds.x - rowBounds.x + 32,
      titleBounds.y - rowBounds.y + 5,
    );
    const clearBackground = await opaquePixel(
      hoverRow,
      titleBounds.x - rowBounds.x + titleBounds.width - 32,
      titleBounds.y - rowBounds.y + 5,
    );
    expect(textBackground).toEqual(clearBackground);
    const dotBefore = await dot.screenshot(),
      learningBefore = await learning.screenshot();
    await page.mouse.down();
    await page.waitForTimeout(220);
    expect(await dot.screenshot()).toEqual(dotBefore);
    expect(await learning.screenshot()).toEqual(learningBefore);
    await page.screenshot({ path: `${evidence}/title-held-${theme}.png` });
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect.poll(async () => Buffer.compare(await row.screenshot(), restingRow)).toBe(0);
    await page.screenshot({ path: `${evidence}/title-exited-${theme}.png` });

    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    const form = page.getByRole('form', { name: 'New course' });
    const selected = form.getByRole('radio', { name: /Steady retention/ }).locator('..');
    await settle(form);
    const before = await opaquePixel(await selected.screenshot(), 12, 40);
    await selected.hover();
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.waitForTimeout(180);
    expect(await opaquePixel(await selected.screenshot(), 12, 40)).toEqual(before);
    await page.screenshot({ path: `${evidence}/target-held-${theme}.png` });
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });
}

test('normal switch edge click retains its target through hover and selection', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Auto-start breaks' });
  await settle(toggle);
  const point = await toggle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y - 5 };
  });
  const hit = () =>
    toggle.evaluate(
      (element, point) => document.elementFromPoint(point.x, point.y) === element,
      point,
    );
  expect(await hit()).toBe(true);
  const before = await toggle.getAttribute('aria-checked');
  await toggle.hover();
  await page.waitForTimeout(350);
  expect(await hit()).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await settle(toggle);
  expect(await hit()).toBe(true);
  await page.screenshot({ path: `${evidence}/switch-after-edge-click.png` });
});

for (const origin of ['Today', 'course']) {
  test(`Study carries opaque paint through cancellation and normal start from ${origin}`, async ({
    page,
  }) => {
    await enterFreshLacuna(page);
    await importWelcomeCourse(page);
    if (origin === 'course') {
      await page
        .getByRole('region', { name: 'Today, most urgent first' })
        .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
        .click();
    }
    if (origin === 'course') await expect(page).toHaveURL(/#\/course\/[^/?#]+$/);
    const original = page.url();
    const study =
      origin === 'Today'
        ? page.getByRole('button', { name: 'Study Welcome to Lacuna' })
        : page.getByRole('button', { name: 'Study', exact: true });
    await study.click();
    const sheet = page.getByRole('region', { name: 'Session preview' });
    await settle(sheet);
    await page.screenshot({ path: `${evidence}/study-settled-${origin}.png` });
    await page.evaluate(() =>
      window.addEventListener('lacuna:landing-transition', (event) => {
        (window as unknown as { launchColour: string }).launchColour = (
          event as CustomEvent<{ colour: string }>
        ).detail.colour;
      }),
    );
    await sheet.getByRole('button', { name: 'Start session', exact: true }).first().click();
    const cover = page.getByTestId('study-cover');
    await expect(cover).toBeVisible();
    const colour = await page.evaluate(
      () => (window as unknown as { launchColour: string }).launchColour,
    );
    expect(colour).not.toMatch(/rgba\([^)]*,\s*0\s*\)|transparent/);
    const alpha = await cover
      .locator(':scope > div')
      .last()
      .evaluate((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = getComputedStyle(element).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      });
    expect(alpha).toBe(255);
    await cover.getByRole('button', { name: 'Exit', exact: true }).click();
    await expect(cover).toBeHidden();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(original);
    await study.click();
    await settle(sheet);
    await sheet.getByRole('button', { name: 'Start session', exact: true }).first().click();
    await expect(page).toHaveURL(/\/(study|learn)(?:[?#]|$)/);
  });
}

test('empty toolbar stays beside its instruction and the short desktop keeps Study available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await enterFreshLacuna(page);
  const create = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  const instruction = page.getByText('Start a course to organise your lessons and cards.', {
    exact: true,
  });
  expect(await create.count()).toBe(1);
  const action = (await create.boundingBox())!,
    text = (await instruction.boundingBox())!;
  expect(
    Math.max(text.y - action.y - action.height, action.y - text.y - text.height, 0),
  ).toBeLessThan(48);
  await create.click();
  const form = page.getByRole('form', { name: 'New course' });
  await form.getByRole('textbox', { name: 'Course name' }).fill('Retained mouse draft');
  await settle(form);
  await create.click();
  await page.waitForTimeout(70);
  await create.click({ force: true });
  await expect(form.getByRole('textbox', { name: 'Course name' })).toHaveValue(
    'Retained mouse draft',
  );
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await importWelcomeCourse(page);
  const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
  await settle(study);
  const bounds = (await study.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(600);
  await expect(page.getByLabel('Today: 0 reviews due', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByText('0 min', { exact: true })).toBeHidden();
  await page.screenshot({ path: `${evidence}/today-short-1280x600.png` });
});
