import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test('cannot save the previous clip while its replacement is being recorded or stored', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    let grant: ((stream: MediaStream) => void) | undefined;
    let signal: AudioContext | undefined;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    });
    window.addEventListener('grant-test-mic', () => {
      signal = new AudioContext();
      const destination = signal.createMediaStreamDestination();
      const tone = signal.createOscillator();
      tone.connect(destination);
      tone.start();
      void signal.resume();
      grant?.(destination.stream);
    });
    window.addEventListener('close-test-signal', () => void signal?.close());
    const NativeRecorder = MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options);
        window.addEventListener(
          'fail-test-recorder',
          () => this.dispatchEvent(new Event('error')),
          { once: true },
        );
      }
    };
  });
  await enterFreshLacuna(page);
  const courseUrl = await createCourse(page, 'Audio practice', false);
  await page.goto(`${courseUrl}/cards/new`);
  await page.getByRole('button', { name: 'More card types' }).click();
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  const oldClip = Buffer.alloc(46);
  oldClip.write('RIFF', 0);
  oldClip.writeUInt32LE(38, 4);
  oldClip.write('WAVEfmt ', 8);
  oldClip.writeUInt32LE(16, 16);
  oldClip.writeUInt16LE(1, 20);
  oldClip.writeUInt16LE(1, 22);
  oldClip.writeUInt32LE(8000, 24);
  oldClip.writeUInt32LE(16000, 28);
  oldClip.writeUInt16LE(2, 32);
  oldClip.writeUInt16LE(16, 34);
  oldClip.write('data', 36);
  oldClip.writeUInt32LE(2, 40);
  const oldHash = createHash('sha256').update(oldClip).digest('hex');
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'original.wav', mimeType: 'audio/wav', buffer: oldClip });
  await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('A tone');
  const save = page.getByRole('button', { name: 'Add card', exact: true });
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Starting…', exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('textbox', { name: 'Answer', exact: true }).press('Control+Enter');
  await expect(page).toHaveURL(`${courseUrl}/cards/new`);
  await page.evaluate(() => window.dispatchEvent(new Event('grant-test-mic')));
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.screenshot({ path: info.outputPath('recording-save-disabled.png') });
  await page.evaluate(() => window.dispatchEvent(new Event('fail-test-recorder')));
  await expect(save).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('close-test-signal')));
  const notifications = page.getByLabel('Notifications', { exact: true });
  const recordingError = notifications.getByText('Could not record audio. Try again.', {
    exact: true,
  });
  await expect(recordingError).toBeVisible();
  await notifications.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(recordingError).toBeHidden();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Starting…', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('grant-test-mic')));
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let held = false;
    crypto.subtle.digest = async (algorithm, data) => {
      if (!held) {
        held = true;
        await new Promise<void>((resolve) =>
          window.addEventListener('release-test-store', () => resolve(), { once: true }),
        );
      }
      return digest(algorithm, data);
    };
  });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replace', exact: true })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(save).toBeDisabled();
  await page.getByRole('textbox', { name: 'Prompt (optional)' }).fill('Identify this sound');
  await page.screenshot({ path: info.outputPath('processing-save-disabled.png') });
  await page.evaluate(() => window.dispatchEvent(new Event('release-test-store')));
  await expect(save).toBeEnabled();
  await page.screenshot({ path: info.outputPath('replacement-ready-to-save.png') });
  await save.click();
  await expect(page).toHaveURL(`${courseUrl}/cards`);
  const fronts = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opened = indexedDB.open('lacuna');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const database = opened.result;
          const read = database.transaction('cards').objectStore('cards').getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            database.close();
            resolve(read.result.map((card: { front: string }) => card.front));
          };
        };
      }),
  );
  expect(fronts).toHaveLength(1);
  expect(fronts[0]).toContain('![audio](lacuna-asset://');
  expect(fronts[0]).not.toContain(oldHash);
  expect(fronts[0]).toContain('Identify this sound');
  await page.evaluate(() => window.dispatchEvent(new Event('close-test-signal')));
});
