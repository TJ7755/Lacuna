import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function writeRow(page: Page, label: string, prompt: string, scheme: string) {
  const question = page.getByRole('textbox', { name: `${label} question`, exact: true });
  await expect(question).toBeFocused();
  await question.fill(prompt);
  await question.press('Tab');
  const marking = page.getByRole('textbox', { name: `${label} mark scheme`, exact: true });
  await expect(marking).toBeFocused();
  await marking.fill(scheme);
  return marking;
}

test('a parent diagram added after starting an attempt is available in every part of the latest version', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterFreshLacuna(page);
  await createCourse(page, 'Shared diagrams', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Flowcharts');
  await page.keyboard.press('Enter');
  await (await writeRow(page, 'Q1', 'Use this flowchart.', 'Output')).press('Tab');
  await page.keyboard.press('Tab');
  await (await writeRow(page, 'Q1 (a)', 'State the output for 150.', 'Output')).press('Tab');
  await writeRow(page, 'Q1 (b)', 'State the output for 200.', 'Output');
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  const overviewUrl = page.url();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
  const previousAttempt = page.url();
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('My saved answer');
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page).not.toHaveURL(previousAttempt);
  await page.goto(overviewUrl);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Add image', exact: true }).click();
  await page.getByLabel('Image file', { exact: true }).setInputFiles({
    name: 'flowchart.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="white"/><text x="30" y="80" font-size="28">Input → Output</text></svg>',
    ),
  });
  await page
    .getByRole('textbox', { name: 'Image description', exact: true })
    .fill('Shared flowchart');
  await page.getByRole('button', { name: 'Add image', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Q1 question', exact: true })).toHaveValue(
    /lacuna-asset:/,
  );
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Control+Enter');
  const overview = testInfo.outputPath('updated-question-set.png');
  await expect(
    page.getByRole('button', { name: 'Start latest version', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: overview });
  await testInfo.attach('updated-question-set', { path: overview, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Resume previous version', exact: true }).click();
  await expect(page).toHaveURL(previousAttempt);
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue(
    'My saved answer',
  );
  await expect(page.getByRole('img', { name: 'Shared flowchart', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page).not.toHaveURL(previousAttempt);
  await page.goto(overviewUrl);
  await page.getByRole('button', { name: 'Start latest version', exact: true }).click();
  await expect(page).not.toHaveURL(previousAttempt);
  for (const part of ['a', 'b']) {
    const image = page.getByRole('img', { name: 'Shared flowchart', exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    const screenshot = testInfo.outputPath(`shared-diagram-${part}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`shared-diagram-${part}`, { path: screenshot, contentType: 'image/png' });
    if (part === 'a') await page.getByRole('button', { name: 'Next part', exact: true }).click();
  }
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`keyboard authoring publishes plain, multipart and multiple-choice questions (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Composer keyboard', false);
    const coursePath = new URL(page.url()).hash.slice(1);
    await page.goto(`/#${coursePath}/questions`);
    await page.getByRole('button', { name: 'New question set', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Forces and motion');
    await page.keyboard.press('Enter');
    const title = page.getByRole('heading', { name: 'Forces and motion', exact: true });
    await expect(title).not.toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Q1 question', exact: true })).toBeFocused();
    await (await writeRow(page, 'Q1', 'State the unit of force.', 'Newton')).press('Tab');
    const secondScheme = await writeRow(
      page,
      'Q2',
      'Define acceleration.',
      'Change in velocity per second',
    );
    await secondScheme.press('ArrowRight');
    const marks = page.getByRole('textbox', { name: 'Q2 marks', exact: true });
    await expect(marks).toBeFocused();
    await expect(marks).toHaveAttribute('tabindex', '-1');
    await marks.press('Enter');
    await (
      await writeRow(page, 'Q3', 'A car accelerates from rest.', 'Use F = ma (2)')
    ).press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Mark scheme moved into (a)')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Q3 (a) mark scheme', exact: true }),
    ).toHaveValue('Use F = ma (2)');
    await (await writeRow(page, 'Q3 (a)', 'Calculate the force.', 'Use F = ma (2)')).press('Tab');
    await (
      await writeRow(page, 'Q3 (b)', 'Consider its motion.', 'Velocity increases')
    ).press('Tab');
    await page.keyboard.press('Tab');
    await (
      await writeRow(page, 'Q3 (b) (i)', 'Describe the velocity.', 'Velocity increases')
    ).press('Tab');
    await writeRow(page, 'Q3 (b) (ii)', 'State the direction.', 'Forwards');
    await page.getByRole('button', { name: '+ Question', exact: true }).click();
    const mcq = page.getByRole('textbox', { name: 'Q4 question', exact: true });
    await mcq.fill('Which quantity is a vector?');
    await mcq.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Multiple choice', exact: true }).click();
    await page.getByRole('textbox', { name: 'Option 1', exact: true }).fill('Velocity');
    await page.getByRole('textbox', { name: 'Option 2', exact: true }).fill('Speed');
    await page.getByRole('radio', { name: 'Option 1 is correct', exact: true }).check();
    await page.getByRole('textbox', { name: 'Q4 mark scheme', exact: true }).fill('Velocity');
    await expect(page.getByRole('button', { name: 'Q4 row options', exact: true })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('button', { name: 'Back to composer', exact: true }).click();
    await expect(title).not.toBeFocused();
    await mcq.focus();
    await mcq.press('Control+Enter');
    await expect(page).toHaveURL(/question-sets\/[^/]+$/);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  });
}

test('resizes wrapped composer fields without ResizeObserver delivery errors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Composer resizing', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Wrapping questions');
  await page.keyboard.press('Enter');
  const question = page.getByRole('textbox', { name: 'Q1 question', exact: true });
  const scheme = page.getByRole('textbox', { name: 'Q1 mark scheme', exact: true });
  await expect(question).toBeFocused();
  await page.evaluate(() => {
    const errors: string[] = [];
    Object.assign(window, { composerResizeErrors: errors });
    window.addEventListener('error', (event) => {
      if (event.message.includes('ResizeObserver')) errors.push(event.message);
    });
  });
  await question.fill('Explain how the specialised structures support the cell. '.repeat(8));
  await scheme.fill('Relate the structure to its function. '.repeat(6));
  for (const width of [390, 800, 320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    for (const field of [question, scheme]) {
      await expect
        .poll(() =>
          field.evaluate((element) => {
            const textarea = element as HTMLTextAreaElement;
            return textarea.scrollHeight <= textarea.clientHeight + 1;
          }),
        )
        .toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  expect(
    await page.evaluate(
      () => (window as Window & { composerResizeErrors?: string[] }).composerResizeErrors,
    ),
  ).toEqual([]);
});
