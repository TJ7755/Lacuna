import { expect, test, type Page } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function holdCardWrites(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('cards', 'readwrite');
          let held = true;
          (window as Window & { releaseCorrectionWrite?: () => void }).releaseCorrectionWrite =
            () => {
              held = false;
            };
          const keepAlive = () => {
            const read = transaction.objectStore('cards').get('__correction_lock__');
            read.onsuccess = () => {
              if (held) keepAlive();
            };
          };
          transaction.oncomplete = () => database.close();
          keepAlive();
          resolve();
        };
      }),
  );
  return () =>
    page.evaluate(() => {
      (window as Window & { releaseCorrectionWrite?: () => void }).releaseCorrectionWrite?.();
    });
}

for (const kind of ['Numeric', 'Working']) {
  test(`corrects a ${kind.toLowerCase()} card without leaving study`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await createCourse(page, `${kind} correction`);
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('button', { name: 'More card types', exact: true }).click();
    await page
      .getByRole('button', { name: kind === 'Numeric' ? 'Numeric answer' : kind, exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Solve 2x = 10.');
    const fieldName = kind === 'Numeric' ? 'Expected answer' : 'Scheme source';
    await page
      .getByRole('textbox', { name: fieldName, exact: true })
      .fill(kind === 'Numeric' ? '4' : '[1] answer :: equals :: 4');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await page.getByRole('link', { name: 'Path', exact: true }).click();
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    const card = page.locator('[data-study-card-id]');
    const id = await card.getAttribute('data-study-card-id');
    const sessionUrl = page.url();
    const studentField = page.getByRole('textbox', {
      name: kind === 'Numeric' ? 'Your answer' : 'Your working',
      exact: true,
    });
    const check = page.getByRole('button', {
      name: kind === 'Numeric' ? 'Check answer' : 'Check working',
      exact: true,
    });
    await studentField.fill('5');
    await check.click();
    await expect(page.getByText('0 / 1 marks', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Card actions', exact: true }).click();
    await page.getByRole('button', { name: 'Edit card', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit card', exact: true });
    await expect(editor.getByRole('textbox', { name: fieldName, exact: true })).toHaveValue(
      kind === 'Numeric' ? '4' : '[1] answer :: equals :: 4',
    );
    await editor
      .getByRole('textbox', { name: fieldName, exact: true })
      .fill(kind === 'Numeric' ? '5' : '[1] answer :: equals :: 5');
    // Close inside the draft debounce, then reopen the same session editor.
    await editor.getByRole('textbox', { name: fieldName, exact: true }).press('Escape');
    await expect(editor).toBeHidden();
    await page.getByRole('button', { name: 'Card actions', exact: true }).click();
    await page.getByRole('button', { name: 'Edit card', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: fieldName, exact: true })).toHaveValue(
      kind === 'Numeric' ? '5' : '[1] answer :: equals :: 5',
    );
    const release = await holdCardWrites(page);
    try {
      await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(editor.getByRole('textbox', { name: fieldName, exact: true })).toBeDisabled();
      await editor.getByRole('button', { name: 'Close editor', exact: true }).click();
      await expect(editor).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${kind.toLowerCase()}-correction-saving.png`),
      });
    } finally {
      await release();
    }
    await expect(editor).toBeHidden();
    await expect(page).toHaveURL(sessionUrl);
    await expect(card).toHaveAttribute('data-study-card-id', id!);
    await expect(studentField).toBeVisible();
    await studentField.fill('5');
    await check.click();
    await expect(
      page.getByText(kind === 'Numeric' ? '1 / 1 mark' : '1 / 1 marks', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Card actions', exact: true }).click();
    await page.getByRole('button', { name: 'Edit card', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: fieldName, exact: true })).toHaveValue(
      kind === 'Numeric' ? '5' : '[1] answer :: equals :: 5',
    );
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
}
