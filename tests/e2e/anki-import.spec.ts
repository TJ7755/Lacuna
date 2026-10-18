import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

const require = createRequire(import.meta.url);

async function ankiPackage(): Promise<Buffer> {
  const SQL = await initSqlJs({
    wasmBinary: new Uint8Array(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))).buffer,
  });
  const collection = new SQL.Database();
  try {
    collection.run(`
      CREATE TABLE notetypes (id, name, type, flds, tmpl);
      CREATE TABLE decks (id, name);
      CREATE TABLE notes (id, mid, flds, tags, sfld);
      CREATE TABLE cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags);
      CREATE TABLE revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type);
      INSERT INTO notetypes VALUES (1, 'Basic', 0, '[]', '[]');
      INSERT INTO decks VALUES (1, 'Biology');
      INSERT INTO cards VALUES (100, 10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    `);
    collection.run('INSERT INTO notes VALUES (?, ?, ?, ?, ?)', [
      10,
      1,
      'What is a cell?\x1fThe basic unit of life',
      '',
      'What is a cell?',
    ]);
    return Buffer.from(
      zipSync({
        'collection.anki2': collection.export(),
        media: strToU8('{}'),
      }),
    );
  } finally {
    collection.close();
  }
}

test.use({ serviceWorkers: 'block' });

test('previews an Anki package under production CSP while JavaScript evaluation stays blocked', async ({
  page,
  context,
  baseURL,
}) => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const policy = config.headers
    .find((entry) => entry.source === '/(.*)')!
    .headers.find((header) => header.key === 'Content-Security-Policy')!.value;
  // Vite preview does not serve Vercel's headers. Workers need their own response policy.
  await context.route(`${new URL(baseURL!).origin}/**`, async (route) => {
    const response = await route.fetch();
    // Model the old worker response retained by immutable HTTP or PWA caches after upgrade.
    const responsePolicy = /\/assets\/apkg\.worker-/.test(route.request().url())
      ? policy.replace(" 'wasm-unsafe-eval'", '')
      : policy;
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': responsePolicy },
    });
  });

  await enterFreshLacuna(page);
  await openImport(page);
  await page.getByRole('button', { name: /Anki deck/ }).click();
  const importer = page.locator('.card-import-panel');
  const workerResponse = page.waitForResponse(/\/assets\/apkg(?:Import)?\.worker-.*\.js$/);
  await importer.getByLabel('Upload cards').setInputFiles({
    name: 'biology.apkg',
    mimeType: 'application/octet-stream',
    buffer: await ankiPackage(),
  });
  expect((await workerResponse).headers()['content-security-policy']).toBe(policy);
  await expect(importer.getByText('biology.apkg', { exact: true })).toBeVisible();
  await expect(importer.getByRole('alert')).toHaveCount(0);
  await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
  await expect(importer.getByText('What is a cell?', { exact: true })).toBeVisible();
  await expect(
    importer.getByRole('button', { name: 'Choose destination', exact: true }),
  ).toBeEnabled();

  // Run as a page script: DevTools evaluation itself bypasses CSP restrictions.
  await page.addScriptTag({
    content: `
    window.cspProbe = (async () => {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      try { (0, eval)('1 + 1'); return 'JavaScript evaluation allowed'; }
      catch (error) { return error.name; }
    })();
  `,
  });
  expect(await page.evaluate(() => Reflect.get(window, 'cspProbe'))).toBe('EvalError');
});
