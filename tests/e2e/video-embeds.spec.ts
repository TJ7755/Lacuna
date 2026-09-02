import { expect, test } from '@playwright/test';
import {
  VIMEO_EMBED_URL,
  YOUTUBE_EMBED_URL,
  authorVideoEmbedNote,
  installVideoEmbedFixtures,
} from './fixtures/videoEmbeds';

test('note authoring loads both allowlisted video provider documents', async ({ page }) => {
  const fixtures = await installVideoEmbedFixtures(page);

  await authorVideoEmbedNote(page);

  expect(fixtures.requests).toEqual(expect.arrayContaining([YOUTUBE_EMBED_URL, VIMEO_EMBED_URL]));
});
