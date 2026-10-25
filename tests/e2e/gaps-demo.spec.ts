import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

test.skip(
  process.env.LACUNA_BROWSER_SITE !== 'gaps',
  'Run verify:browser -- --gaps for the separate teacher build',
);
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const pupilNames = [
  'Ada Bennett',
  'Ben Carter',
  'Chloe Evans',
  'Dylan Hughes',
  'Esme Patel',
  'Finn Wilson',
];
const demoTitle = 'Biology — fictional demo';
const fictionalNotice =
  'Fictional demo: six invented pupils and answers. Nothing is saved or sent.';

async function browserStorage(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const stored = [];
    for (const { name, version } of databases.sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    )) {
      if (!name) throw new Error('A browser database has no name.');
      const stores = await new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const opening = indexedDB.open(name);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const names = [...database.objectStoreNames].sort();
          if (!names.length) {
            database.close();
            resolve({});
            return;
          }
          const transaction = database.transaction(names, 'readonly');
          const rows: Record<string, unknown[]> = {};
          for (const store of names) {
            const request = transaction.objectStore(store).getAll();
            request.onsuccess = () => {
              rows[store] = request.result;
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(rows);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      });
      stored.push({ name, version, stores });
    }
    return {
      local: { ...localStorage },
      session: { ...sessionStorage },
      databases: stored,
      caches: (await caches.keys()).sort(),
    };
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectEqualResultWidths(table: Locator, expectedWidth?: number) {
  const widths = await table
    .locator('td > button')
    .evaluateAll((cells) => cells.map((cell) => cell.clientWidth));
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...widths)).toBeLessThanOrEqual(120);
  if (expectedWidth !== undefined)
    for (const width of widths) expect(Math.abs(width - expectedWidth)).toBeLessThanOrEqual(1);
  return widths[0];
}

for (const viewport of [
  { width: 1280, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1280, height: 900, theme: 'light' },
  { width: 390, height: 844, theme: 'light' },
  { width: 1920, height: 1080, theme: 'light' },
]) {
  test(`explores fictional class evidence without setup, relay or persistence at ${viewport.width}px in ${viewport.theme} mode`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(30_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(
      (theme) => localStorage.setItem('lacuna-theme', theme),
      viewport.theme,
    );
    const errors: string[] = [];
    const blockedRequests: { method: string; url: string; type: string }[] = [];
    const storageChecks: { stage: string; state: Awaited<ReturnType<typeof browserStorage>> }[] =
      [];
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = new URL(baseURL!).origin;
    // Abort attempted data requests too: a failed relay call is still a demo regression.
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin !== origin ||
        ['fetch', 'xhr', 'ping'].includes(request.resourceType())
      ) {
        blockedRequests.push({
          method: request.method(),
          url: request.url(),
          type: request.resourceType(),
        });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });

    try {
      await page.goto('/');
      const main = page.getByRole('main');
      const explore = main.getByRole('button', { name: 'Explore a demo class', exact: true });
      const empty = main.getByRole('heading', { name: 'Connect your first class' });
      await expect(empty).toBeVisible();
      await expect(explore).toBeInViewport();
      const baseline = await browserStorage(page);
      expect(baseline.databases.map(({ name }) => name)).toEqual(['lacuna.gaps.connections']);
      for (const database of baseline.databases)
        for (const rows of Object.values(database.stores)) expect(rows).toEqual([]);
      storageChecks.push({ stage: 'fresh browser', state: baseline });
      async function expectUnchangedStorage(stage: string) {
        const state = await browserStorage(page);
        storageChecks.push({ stage, state });
        expect(state).toEqual(baseline);
      }

      const started = Date.now();
      await explore.click();
      await expect(main.getByRole('heading', { name: demoTitle, exact: true })).toBeVisible();
      await expect(main.getByText(fictionalNotice, { exact: true })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Class results', exact: true })).toBeVisible();
      await expect(main.getByRole('tab', { name: 'Results', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(main.getByRole('tab', { name: 'Pupils', exact: true })).toBeVisible();
      await expect(main.getByRole('form')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(main.getByRole('checkbox')).toHaveCount(0);
      await expect(main.getByRole('tab', { name: 'Invite', exact: true })).toHaveCount(0);
      await expect(
        main.getByRole('button', { name: /Refresh results|Class settings/ }),
      ).toHaveCount(0);

      const table = main.getByRole('table');
      await expect(table.getByRole('rowheader')).toHaveText(pupilNames);
      await expect(table.getByRole('columnheader').nth(1)).toHaveText(/Explain osmosis\.\s*30%/);
      const unknown = table.getByRole('button', {
        name: 'Finn Wilson, Explain osmosis.: unknown',
        exact: true,
      });
      await expect(unknown).toHaveText('Unknown');
      const revisit = main.getByRole('region', { name: 'Worth revisiting' });
      const osmosis = revisit.getByRole('listitem').filter({ hasText: 'Explain osmosis.' });
      await expect(osmosis).toContainText('30%');
      await expect(osmosis).toContainText('3 of 6 with a gap');
      await expectNoHorizontalOverflow(page);
      await expectUnchangedStorage('results after one click');
      expect(blockedRequests).toEqual([]);
      await capture(page, testInfo, `gaps-demo-results-${viewport.width}`);
      await expect(table).toHaveCSS('border-spacing', '6px');
      const cell = table.locator('td button').first();
      await expect(cell).toHaveCSS('border-radius', '10px');
      await expect(cell.locator('span')).toHaveCSS('padding-left', '8px');
      await expect(main.getByRole('list', { name: 'Key', exact: true })).toHaveCSS(
        'column-gap',
        '20px',
      );
      const resultWidth = await expectEqualResultWidths(table);
      const questionLabels = table.locator('thead button > span:first-child');
      for (const label of await questionLabels.all()) {
        await expect(label).toHaveCSS('white-space', 'nowrap');
        await expect(label).toHaveCSS('text-overflow', 'ellipsis');
      }
      const longQuestion = table.getByRole('button', {
        name: /^How does active transport differ from diffusion\?/,
      });
      await expect(longQuestion).toHaveAttribute(
        'title',
        'How does active transport differ from diffusion?',
      );
      expect(
        await longQuestion
          .locator('span')
          .first()
          .evaluate((label) => label.scrollWidth > label.clientWidth),
      ).toBe(true);
      await longQuestion.click();
      const longAnswers = main.getByRole('region', { name: 'Answers', exact: true });
      await expect(
        longAnswers.getByRole('heading', {
          name: 'How does active transport differ from diffusion?',
          exact: true,
        }),
      ).toBeVisible();
      await expectEqualResultWidths(table, resultWidth);
      await longAnswers.getByRole('button', { name: 'Close', exact: true }).click();

      await table.getByRole('button', { name: /^Explain osmosis\.\s*30%$/ }).click();
      const answers = main.getByRole('region', { name: 'Answers', exact: true });
      await expect(answers.getByRole('heading', { name: 'Explain osmosis.' })).toBeVisible();
      await expect(answers.getByText('6 pupils', { exact: true })).toBeVisible();
      const misconception = answers.getByRole('listitem').filter({
        hasText: 'Water moves from a concentrated solution to a dilute solution.',
      });
      await expect(misconception).toHaveCount(1);
      await expect(misconception).toContainText('Ada Bennett, Ben Carter, Chloe Evans');
      await expect(misconception).toContainText('0 / 2 marks · Self marked');
      await expect(answers.getByText('Dylan Hughes', { exact: true })).toBeVisible();
      await expect(answers.getByText('Esme Patel', { exact: true })).toBeVisible();
      const unmarked = answers.getByRole('listitem').filter({
        hasText: 'I am unsure which way the water moves.',
      });
      await expect(unmarked).toContainText('Finn Wilson');
      await expect(unmarked).toContainText('Unknown / 2 marks · Self marked');
      await expectNoHorizontalOverflow(page);
      await expectEqualResultWidths(table, resultWidth);
      await capture(page, testInfo, `gaps-demo-answers-${viewport.width}`);

      await unknown.click();
      const evidence = main.getByRole('region', { name: 'Evidence for Finn Wilson' });
      const osmosisEvidence = evidence.getByRole('listitem').filter({
        hasText: 'Explain osmosis.',
      });
      await expect(osmosisEvidence).toContainText('I am unsure which way the water moves.');
      await expect(osmosisEvidence).toContainText('Unknown / 2 marks · Self marked');
      await expectNoHorizontalOverflow(page);
      await expectEqualResultWidths(table, resultWidth);
      await capture(page, testInfo, `gaps-demo-pupil-evidence-${viewport.width}`);
      await expectUnchangedStorage('supporting answers and pupil evidence');
      await testInfo.attach('automated-demo-path', {
        body: JSON.stringify({ elapsedMs: Date.now() - started, viewport }, null, 2),
        contentType: 'application/json',
      });

      await main.getByRole('button', { name: 'Exit demo', exact: true }).click();
      await expect(empty).toBeVisible();
      await expect(main.getByLabel('Course link or code')).toBeVisible();
      await expect(main.getByRole('heading', { name: demoTitle })).toHaveCount(0);
      await expect(table).toHaveCount(0);
      await expectUnchangedStorage('after exit');
      await expectNoHorizontalOverflow(page);

      await explore.click();
      await expect(main.getByRole('heading', { name: 'Class results', exact: true })).toBeVisible();
      await expectUnchangedStorage('reopened demo before reload');
      await page.reload();
      await expect(empty).toBeVisible();
      await expect(explore).toBeVisible();
      await expect(main.getByRole('heading', { name: demoTitle })).toHaveCount(0);
      await expect(table).toHaveCount(0);
      await expectUnchangedStorage('reload while demo was open');
      await expectNoHorizontalOverflow(page);
      expect(blockedRequests).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await testInfo.attach('demo-network-and-storage', {
        body: JSON.stringify({ blockedRequests, errors, storageChecks }, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
