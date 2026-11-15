import { expect, test } from '@playwright/test';
import { seedStudyCards } from './fixtures/studyCards';
import { settle } from './fixtures/flowEvidence';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

const DIAGRAM = '/__lesson-card-eye.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="410" viewBox="0 0 720 410"><rect width="720" height="410" fill="#f6f7f1"/><ellipse cx="320" cy="205" rx="210" ry="155" fill="#e7eef0" stroke="#586776" stroke-width="4"/><ellipse cx="160" cy="205" rx="32" ry="75" fill="white" stroke="#586776" stroke-width="3"/><path d="M530 190L620 190L620 225L530 225" fill="#f3cbc4" stroke="#586776" stroke-width="3"/><text x="640" y="210" font-size="24">G</text></svg>';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`lesson cards retain full diagrams, edit on a full page and return to the lesson (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1165 });
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(
      (theme) => localStorage.setItem('lacuna-theme', theme),
      reducedMotion === 'reduce' ? 'dark' : 'light',
    );
    await page.route('**/__lesson-card-eye.svg', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: SVG }),
    );
    const seeded = await seedStudyCards(
      page,
      'Biology',
      Array.from(
        { length: 9 },
        (_, index) =>
          [
            `Identify structure G (${index + 1}).\n\n![Eye cross-section](${DIAGRAM})`,
            'Optic nerve.',
          ] as const,
      ),
    );
    const lessonPath = `/#/course/${seeded.courseId}/lesson/${seeded.lessonId}`;
    await page.goto(lessonPath);
    const all = page.getByRole('link', { name: 'All 9 cards', exact: true });
    await expect(page.getByRole('heading', { name: /^Manage/ })).toHaveCount(0);
    const spelling = page.getByRole('switch', { name: 'Require correct spelling' });
    const spacing = await spelling.evaluate((button) => {
      const row = button.closest('label')!.parentElement!.getBoundingClientRect();
      const control = button.getBoundingClientRect();
      return { above: control.top - row.top, below: row.bottom - control.bottom };
    });
    expect(spacing.above).toBeGreaterThanOrEqual(12);
    expect(spacing.below).toBeGreaterThanOrEqual(12);
    const practice = page.getByRole('button', { name: 'Practise until all correct', exact: true });
    await page.screenshot({ path: testInfo.outputPath('lesson-preview.png') });
    await testInfo.attach('Lesson preview and spelling spacing', {
      path: testInfo.outputPath('lesson-preview.png'),
      contentType: 'image/png',
    });
    await practice.click();
    await expect(page.getByRole('combobox', { name: 'What to practise' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start practising', exact: true })).toBeVisible();
    await settle(practice.locator('..'));
    await page.screenshot({ path: testInfo.outputPath('lesson-practice.png') });
    await testInfo.attach('Flow practice options', {
      path: testInfo.outputPath('lesson-practice.png'),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(practice).toHaveAttribute('aria-expanded', 'false');
    await expect(practice).toBeFocused();
    await all.click();
    await expect(page).toHaveURL(new RegExp(`/lesson/${seeded.lessonId}/cards$`));
    await expect(page.getByRole('article')).toHaveCount(9);
    const settings = page.getByRole('button', { name: 'Lesson settings', exact: true });
    await settings.click();
    const reveal = page.getByRole('radio', { name: 'Reveal answers', exact: true });
    const type = page.getByRole('radio', { name: 'Type answers', exact: true });
    await expect(type).toBeVisible();
    await settle(settings.locator('..'));
    const revealRect = (await reveal.boundingBox())!;
    const typeRect = (await type.boundingBox())!;
    expect(Math.abs(revealRect.y - typeRect.y)).toBeLessThan(1);
    expect(typeRect.x).toBeGreaterThan(revealRect.x);
    await reveal.focus();
    await reveal.press('ArrowDown');
    await expect(type).toHaveAttribute('aria-checked', 'true');
    await expect(type).toBeFocused();
    const answerMode = page.getByRole('group', { name: 'Suggested answer mode', exact: true });
    await expect(answerMode).toHaveAttribute('aria-busy', 'false');
    await type.press('ArrowUp');
    await expect(reveal).toHaveAttribute('aria-checked', 'true');
    await expect(reveal).toBeFocused();
    await expect(answerMode).toHaveAttribute('aria-busy', 'false');
    await reveal.press('ArrowRight');
    await expect(type).toHaveAttribute('aria-checked', 'true');
    await expect(type).toBeFocused();
    await settle(settings.locator('..'));
    await page.screenshot({ path: testInfo.outputPath('answer-mode.png') });
    await testInfo.attach('Compact answer-mode selector', {
      path: testInfo.outputPath('answer-mode.png'),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'View mode', exact: true }).click();
    await expect(settings).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New card', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('article').getByRole('button', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(9);
    await page.getByRole('article').first().focus();
    await page.keyboard.press('e');
    await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(
      page.getByRole('article').first().getByRole('button', { name: 'Edit', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Course sections' })).toBeVisible();
    await expect(page.locator('[data-route-content]').last()).toHaveCSS('opacity', '1');
    const cards = page.getByRole('article');
    const first = cards.first();
    const second = cards.nth(1);
    const image = first.getByRole('img', { name: 'Eye cross-section' });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(720);
    const dimensions = await image.boundingBox();
    expect(dimensions!.width / dimensions!.height).toBeCloseTo(720 / 410, 1);
    expect(dimensions!.height).toBeGreaterThan(100);
    expect(dimensions!.height).toBeLessThanOrEqual(225);
    expect(
      (await second.boundingBox())!.y + (await second.boundingBox())!.height,
    ).toBeLessThanOrEqual(1165);
    await page.screenshot({ path: testInfo.outputPath('lesson-cards.png') });
    await testInfo.attach('Complete lesson cards', {
      path: testInfo.outputPath('lesson-cards.png'),
      contentType: 'image/png',
    });

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await first.getByRole('checkbox').check();
    await page
      .getByRole('toolbar', { name: 'Selected cards' })
      .getByRole('button', { name: 'Suspend', exact: true })
      .click();
    await expect(first.getByText('Suspended', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(9);

    await first.getByRole('button', { name: 'Enlarge image: Eye cross-section' }).click();
    const viewer = page.getByRole('dialog', { name: 'Image', exact: true });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Actual size' }).click();
    await expect(viewer.getByRole('img')).toHaveCSS('max-width', 'none');
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();

    const edit = first.getByRole('button', { name: 'Edit', exact: true });
    await edit.click();
    await expect(page).toHaveURL(/\/cards\/[^/]+\/edit$/);
    await expect(page.getByRole('heading', { name: 'Edit card', exact: true })).toBeVisible();
    const front = page.getByRole('textbox', { name: 'Front', exact: true });
    const back = page.getByRole('textbox', { name: 'Back', exact: true });
    await expect(front).toHaveValue(/Identify structure G/);
    await settle(page.locator('[data-route-content]').last());
    await page.screenshot({ path: testInfo.outputPath('full-card-editor.png') });
    await testInfo.attach('Full card editor', {
      path: testInfo.outputPath('full-card-editor.png'),
      contentType: 'image/png',
    });
    await back.fill('Carries impulses from the retina to the brain.');
    await back.press('Control+Enter');
    await expect(page).toHaveURL(new RegExp(`/lesson/${seeded.lessonId}/cards$`));
    await expect(first.getByRole('region', { name: 'Back', exact: true })).toContainText(
      'Carries impulses',
    );

    await edit.click();
    await back.fill('Unfinished explanation');
    await page.getByRole('link', { name: 'Back to lesson cards', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(9);
    await edit.click();
    await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
    await expect(back).toHaveValue('Unfinished explanation');
    await page.getByRole('link', { name: 'Back to lesson cards', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(9);

    const lastEdit = cards.last().getByRole('button', { name: 'Edit', exact: true });
    await lastEdit.scrollIntoViewIfNeeded();
    const scrollPosition = await page.locator('#main-content').evaluate((main) => main.scrollTop);
    await lastEdit.click();
    await page.getByRole('link', { name: 'Back to lesson cards', exact: true }).click();
    await expect
      .poll(() => page.locator('#main-content').evaluate((main) => main.scrollTop))
      .toBeCloseTo(scrollPosition, 0);

    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(first).toBeFocused();
    await page.getByRole('link', { name: 'Back to lesson', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/lesson/${seeded.lessonId}$`));
    // A specific preview opens the same document at that card.
    const cardLink = page.getByRole('link', { name: /^View card: Identify structure G/ }).first();
    await cardLink.click();
    await expect(page).toHaveURL(new RegExp('card='));
    const id = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('card');
    await expect(page.locator(`[data-lesson-card="${id}"]`)).toBeFocused();
  });
}

test('occlusion cards preserve masks, enlargement focus and their owning editor', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Image cards');
  const lessonUrl = page.url();
  await page.goto(`${lessonUrl}/occlusion/new`);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Eye cross-section');
  await page
    .getByLabel('Upload diagram', { exact: true })
    .setInputFiles({ name: 'eye.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
  const canvas = page.getByRole('group', { name: 'Draw a region' });
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await canvas.press('Space');
  await canvas.press('Enter');
  await page.getByRole('button', { name: 'Add occlusion', exact: true }).click();
  await expect(page).toHaveURL(lessonUrl);
  await page.getByRole('link', { name: 'All 1 card', exact: true }).click();
  const card = page.getByRole('article');
  await expect(card.getByRole('img', { name: 'Eye cross-section' })).toHaveCount(2);
  const enlarge = card.getByRole('button', { name: 'Enlarge diagram' }).first();
  await enlarge.click();
  const dialog = page.getByRole('dialog', { name: 'Eye cross-section', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close diagram' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(enlarge).toBeFocused();
  await testInfo.attach('Complete occlusion card', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await card.getByRole('button', { name: 'Edit diagram', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Eye cross-section',
  );
  await page.getByRole('link', { name: 'Back to Lesson cards', exact: true }).click();
  await expect(page).toHaveURL(`${lessonUrl}/cards`);
});
