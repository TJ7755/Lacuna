import { expect, type Page } from '@playwright/test';

export const YOUTUBE_EMBED_URL = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
export const VIMEO_EMBED_URL = 'https://player.vimeo.com/video/123456789';

const VIDEO_NOTE_MARKDOWN = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  '',
  'https://vimeo.com/123456789',
].join('\n');

const fixtureDocuments = [
  {
    url: YOUTUBE_EMBED_URL,
    provider: 'youtube',
    marker: 'YouTube embed fixture document',
  },
  {
    url: VIMEO_EMBED_URL,
    provider: 'vimeo',
    marker: 'Vimeo embed fixture document',
  },
] as const;

export interface VideoEmbedFixtures {
  requests: string[];
}

/** Route the two exact provider documents to hermetic HTML without broadening the host allowlist. */
export async function installVideoEmbedFixtures(page: Page): Promise<VideoEmbedFixtures> {
  const requests: string[] = [];

  await Promise.all(
    fixtureDocuments.map(({ url, provider, marker }) =>
      page.route(url, async (route) => {
        requests.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
          body: `<!doctype html><html lang="en-GB"><body><p data-video-provider="${provider}">${marker}</p></body></html>`,
        });
      }),
    ),
  );

  return { requests };
}

export async function authorVideoEmbedNote(page: Page, navigateToApp = true): Promise<void> {
  if (navigateToApp) await page.goto('/');
  await expect(page.getByRole('region', { name: 'From familiarity to recall' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();

  await page.getByRole('button', { name: 'Expand Welcome to Lacuna' }).click();
  await page.getByRole('link', { name: 'Core concepts & rendering' }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+\/lesson\//);
  await page.getByRole('button', { name: 'Author mode' }).click();
  await expect(page.locator('[data-lesson-workspace-mode="edit"]')).toBeVisible();

  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByPlaceholder('Note title').fill('Provider iframe CSP probe');
  await page.getByPlaceholder('Write your notes in Markdown…').fill(VIDEO_NOTE_MARKDOWN);

  await expectVideoEmbedDocuments(page);

  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('button', { name: 'Provider iframe CSP probe' }).click();
  await expectVideoEmbedDocuments(page);
}

export async function expectVideoEmbedDocuments(page: Page): Promise<void> {
  for (const { url, provider, marker } of fixtureDocuments) {
    const document = page.frameLocator(`iframe[src="${url}"]`);
    await expect(document.locator(`[data-video-provider="${provider}"]`)).toHaveText(marker);
  }
}
