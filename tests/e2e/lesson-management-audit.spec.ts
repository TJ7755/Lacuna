import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`lesson settings targets and rename remain usable at ${width}px with enlarged text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.goto(`${page.url()}/settings`);
    await expect(page.getByRole('heading', { name: 'Course settings', exact: true })).toBeVisible();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    const actions = page.getByRole('button', { name: /^Move .+ (up|down)$/ });
    await expect(actions).toHaveCount(8);
    for (const button of await actions.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const row = await button.evaluate((element) => {
        const bounds = element.parentElement!.parentElement!.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      });
      expect(box!.x).toBeGreaterThanOrEqual(row.left);
      expect(box!.x + box!.width).toBeLessThanOrEqual(row.right);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    const lessonName = page.getByText('Core concepts & rendering', { exact: true });
    const nameBox = await lessonName.boundingBox();
    expect(
      nameBox!.width,
      'The lesson name must retain visible space beside its actions',
    ).toBeGreaterThanOrEqual(44);

    const rename = page.getByRole('button', {
      name: 'Rename Core concepts & rendering',
      exact: true,
    });
    await rename.focus();
    await rename.press('Enter');
    const editor = page.getByRole('textbox', { name: 'Lesson name', exact: true });
    await expect(editor).toBeFocused();
    const editorGeometry = await editor.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      fontSize: parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(
      editorGeometry.width,
      'The lesson editor needs room for at least four characters',
    ).toBeGreaterThanOrEqual(editorGeometry.fontSize * 4);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('lesson-editor-enlarged.png'),
    });
    await editor.press('Escape');
    await expect(rename).toBeFocused();
    await expect(editor).toBeHidden();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('lesson-settings-enlarged.png'),
    });
  });
}
