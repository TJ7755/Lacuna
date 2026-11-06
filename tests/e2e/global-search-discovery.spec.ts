import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('discovers modern question sets, ranks prompts and represents media in both search surfaces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Biology import collection', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Cell practice');
  await page.keyboard.press('Enter');
  await page
    .getByRole('textbox', { name: 'Q1 question', exact: true })
    .fill('Explain selective permeability in a cell membrane.');
  await page
    .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
    .fill('Water crosses the membrane.');
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const setUrl = page.url();
  await page.goto('/#/search?q=selective%20permeability');
  const input = page.getByRole('combobox', { name: 'Search content' });
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('Cell practice');
  await expect(page.getByRole('option').locator('mark')).toHaveText('selective permeability');
  await page.screenshot({ path: test.info().outputPath('modern-set-full-search.png') });
  await input.fill('Cell practice');
  await input.press('Enter');
  await expect(page).toHaveURL(setUrl);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick search' });
  const quick = dialog.getByRole('combobox');
  await quick.fill('selective permeability');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option')).toContainText('Cell practice');
  await page.screenshot({ path: test.info().outputPath('modern-set-quick-search.png') });
  await quick.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(setUrl);

  await page.goto(`/#${coursePath}/cards/new`);
  await page.getByRole('textbox', { name: 'Front', exact: true }).fill('import');
  await page.getByRole('textbox', { name: 'Back', exact: true }).fill('Exact prompt match');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${coursePath}/cards$`));
  // Clone a real authored projection into this disposable profile. Search must not
  // expose raw asset identities or call a media player to represent media-only cards.
  await page.evaluate(async () => {
    const request = indexedDB.open('lacuna');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const image = new Uint8Array(await (await fetch('/icons/icon-192.png')).arrayBuffer());
    const audio = new Uint8Array(46);
    const wav = new DataView(audio.buffer);
    const text = (at: number, value: string) =>
      [...value].forEach((letter, i) => wav.setUint8(at + i, letter.charCodeAt(0)));
    text(0, 'RIFF');
    wav.setUint32(4, 38, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 1, true);
    wav.setUint32(24, 8000, true);
    wav.setUint32(28, 16000, true);
    wav.setUint16(32, 2, true);
    wav.setUint16(34, 16, true);
    text(36, 'data');
    wav.setUint32(40, 2, true);
    const hash = async (bytes: Uint8Array) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
    const [imageHash, audioHash] = await Promise.all([hash(image), hash(audio)]);
    const transaction = database.transaction(['cards', 'assets'], 'readwrite');
    const assets = transaction.objectStore('assets');
    assets.put({
      hash: imageHash,
      blob: image,
      mimeType: 'image/png',
      kind: 'image',
      width: 192,
      height: 192,
      createdAt: Date.now(),
    });
    assets.put({
      hash: audioHash,
      blob: audio,
      mimeType: 'audio/wav',
      kind: 'audio',
      createdAt: Date.now(),
    });
    const store = transaction.objectStore('cards');
    const cards = store.getAll();
    cards.onsuccess = () => {
      const base = cards.result.find((card) => card.front === 'import');
      if (!base) throw new Error('Expected authored card');
      store.put({
        ...base,
        id: 'search-audio',
        front: `![audio](lacuna-asset://${audioHash})`,
        back: 'Media fixture answer',
      });
      store.put({
        ...base,
        id: 'search-image',
        front: `![Cell diagram](lacuna-asset://${imageHash})`,
        back: 'Media fixture answer',
      });
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.goto('/#/search?q=import');
  await expect(page.getByRole('option').first()).toHaveText('importBiology import collection');
  await expect(page.getByRole('option').filter({ hasText: 'Help ·' }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('exact-prompt-ranking.png') });
  await input.fill('Media fixture');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option').filter({ hasText: 'Audio clip' })).toBeVisible();
  await expect(page.getByRole('option').filter({ hasText: 'Cell diagram' })).toBeVisible();
  await expect(page.getByText('(empty front)')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('media-only-results.png') });
  await page.keyboard.press('Control+k');
  await quick.fill('Media fixture');
  await expect(dialog.getByRole('option')).toHaveCount(2);
  await expect(dialog.getByRole('option').filter({ hasText: 'Audio clip' })).toBeVisible();
  await expect(dialog.getByRole('option').filter({ hasText: 'Cell diagram' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('media-only-quick-results.png') });
});
