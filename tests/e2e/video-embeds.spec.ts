import { test } from '@playwright/test';
import { authorVideoEmbedNote, installVideoEmbedFixtures } from './fixtures/videoEmbeds';

test('note authoring loads both allowlisted video provider documents', async ({ page }) => {
  await installVideoEmbedFixtures(page);

  await authorVideoEmbedNote(page);
});
