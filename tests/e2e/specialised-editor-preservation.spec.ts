import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

async function failNextSave(page: Page, store: string) {
  await page.evaluate((storeName) => {
    let failed = false;
    for (const method of ['add', 'put'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (value: unknown, key?: IDBValidKey) {
        if (this.name === storeName && !failed) {
          failed = true;
          throw new DOMException('Test storage failure', 'QuotaExceededError');
        }
        return key === undefined ? original.call(this, value) : original.call(this, value, key);
      };
    }
  }, store);
}

for (const kind of ['sequence', 'occlusion'] as const) {
  test(`${kind} protects unsaved work and keeps a failed save recoverable`, async ({
    page,
  }, info) => {
    await enterFreshLacuna(page);
    const courseUrl = await createCourse(page, 'Biology', false);
    await page.goto(`${courseUrl}/${kind}/new`);
    const name = page.getByRole('textbox', {
      name: kind === 'sequence' ? 'Sequence name' : 'Name',
      exact: true,
    });
    await name.fill(kind === 'sequence' ? 'Respiration' : 'Plant cell');
    if (kind === 'sequence') {
      await page.getByRole('textbox', { name: 'Item 1 content', exact: true }).fill('Glycolysis');
      await page.getByRole('textbox', { name: 'Item 1 content', exact: true }).press('Enter');
      await page.getByRole('textbox', { name: 'Item 2 content', exact: true }).fill('Krebs cycle');
    } else {
      await page.getByLabel('Upload diagram', { exact: true }).setInputFiles({
        name: 'plant-cell.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#eef4df"/><rect x="50" y="45" width="540" height="310" rx="65" fill="#cfe7a4" stroke="#4c7346" stroke-width="14"/><rect x="72" y="66" width="496" height="268" rx="50" fill="#e4efc7" stroke="#7c9f5b" stroke-width="4"/><ellipse cx="345" cy="190" rx="150" ry="93" fill="#d3e5ed" stroke="#7d9c9d" stroke-width="3"/><circle cx="165" cy="215" r="48" fill="#9a83b5" stroke="#66527b" stroke-width="4"/><circle cx="171" cy="211" r="15" fill="#655377"/><g fill="#83aa67" stroke="#547c47" stroke-width="3"><ellipse cx="145" cy="110" rx="27" ry="14"/><ellipse cx="470" cy="300" rx="27" ry="14"/><ellipse cx="500" cy="103" rx="27" ry="14"/><ellipse cx="116" cy="300" rx="27" ry="14"/></g></svg>',
        ),
      });
      const canvas = page.getByRole('group', { name: 'Draw a region' });
      await expect(canvas).toBeVisible();
      await canvas.focus();
      await canvas.press('Space');
      await canvas.press('Enter');
      await expect(page.getByRole('button', { name: 'Delete Box 1' })).toBeVisible();
      await page.getByRole('button', { name: 'Delete Box 1' }).click();
      const undo = page.getByRole('button', { name: 'Undo region deletion' });
      await expect(undo).toBeEnabled();
      await page.screenshot({ path: info.outputPath('region-deleted.png') });
      await undo.click();
      await expect(page.getByRole('button', { name: 'Delete Box 1' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('region-restored.png') });
    }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const guard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(guard).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${kind}-leave-confirmation.png`) });
    await guard.getByRole('button', { name: 'Keep editing' }).click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Today', exact: true })
      .click();
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'Keep editing' }).click();
    const save = page.getByRole('button', {
      name: kind === 'sequence' ? 'Add sequence' : 'Add occlusion',
      exact: true,
    });
    await failNextSave(page, kind === 'sequence' ? 'sequences' : 'occlusions');
    await save.click();
    await expect(page.getByRole('alert')).toHaveText(`Could not save the ${kind}. Try again.`);
    await expect(name).toHaveValue(kind === 'sequence' ? 'Respiration' : 'Plant cell');
    await expect(save).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`${kind}-save-error.png`) });
    await save.click();
    await expect(page).toHaveURL(`${courseUrl}/cards`);
    await expect(guard).toHaveCount(0);
  });
}
