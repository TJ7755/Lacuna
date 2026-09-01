import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import {
  VIMEO_EMBED_URL,
  YOUTUBE_EMBED_URL,
  authorVideoEmbedNote,
  installVideoEmbedFixtures,
} from '../e2e/fixtures/videoEmbeds';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

function electronExecutable(): string {
  const executablePath: unknown = require('electron');
  if (typeof executablePath !== 'string') {
    throw new Error('Electron did not resolve to its platform executable.');
  }
  return executablePath;
}

test('note authoring loads both allowlisted video provider documents', async () => {
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-video-embeds-')));
  let app: ElectronApplication | undefined;

  try {
    app = await electron.launch({
      executablePath: electronExecutable(),
      args: [root, `--user-data-dir=${profile}`],
    });
    const page = await app.firstWindow();
    const fixtures = await installVideoEmbedFixtures(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForLoadState('domcontentloaded');

    await authorVideoEmbedNote(page, false);

    expect(fixtures.requests).toEqual(expect.arrayContaining([YOUTUBE_EMBED_URL, VIMEO_EMBED_URL]));
  } finally {
    await app?.close().catch(() => undefined);
    await rm(profile, { recursive: true, force: true });
  }
});
