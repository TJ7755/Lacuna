import { expect, test, type Locator } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

/** One second of a 440 Hz tone as 8 kHz, 16-bit mono PCM WAV. */
function toneWav(): Buffer {
  const rate = 8000;
  const samples = rate;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  }
  return wav;
}

/** Play the real element (no stubbed play()) and report whether time advanced. */
async function playsThrough(player: Locator) {
  return player.evaluate(async (element: HTMLAudioElement) => {
    element.muted = true;
    element.currentTime = 0;
    await element.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    element.pause();
    return { error: element.error?.code ?? null, currentTime: element.currentTime };
  });
}

test('plays stored audio while authoring and studying in the production build', async ({
  page,
}) => {
  // Regression for #459: the CSP had no media-src, so blob: audio was refused.
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });

  await enterFreshLacuna(page);
  await createCourse(page, 'Audio playback');
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });

  const editorPlayer = page.locator('audio');
  await expect(editorPlayer).toHaveAttribute('src', /^blob:/);
  const authored = await playsThrough(editorPlayer);
  expect(authored.error).toBeNull();
  expect(authored.currentTime).toBeGreaterThan(0);

  await page.getByRole('textbox', { name: 'Answer' }).fill('A tone');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);

  await page.reload();
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const studyPlayer = page.locator('[data-study-face="front"] audio');
  await expect(studyPlayer).toHaveAttribute('src', /^blob:/);
  const studied = await playsThrough(studyPlayer);
  expect(studied.error).toBeNull();
  expect(studied.currentTime).toBeGreaterThan(0);

  expect(violations).toEqual([]);
});
