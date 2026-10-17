import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function openEditor(page: Page, type: string) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Specialised entry');
  await page.getByRole('button', { name: 'New card', exact: true }).first().click();
  await page.getByRole('button', { name: 'More card types' }).click();
  await page.getByRole('button', { name: type, exact: true }).click();
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const type of ['Numeric answer', 'Working']) {
    test(`${type} follows the direct entry and repeat path (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openEditor(page, type);
      const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
      const answer = page.getByRole('textbox', {
        name: type === 'Working' ? 'Scheme source' : 'Expected answer',
        exact: true,
      });
      const repeat = page.getByRole('button', { name: 'Save & add another' });
      for (let entry = 1; entry <= 2; entry++) {
        await expect(prompt).toBeFocused();
        await prompt.fill(`What is ${entry} + ${entry}?`);
        await page.keyboard.press('Tab');
        await expect(answer).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(prompt).toBeFocused();
        await page.keyboard.press('Tab');
        await answer.fill(
          type === 'Working' ? `[1] answer :: equals :: ${entry * 2}` : `${entry * 2}`,
        );
        await page.keyboard.press('Tab');
        await expect(repeat).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(prompt).toHaveValue('');
        await expect(answer).toHaveValue('');
        await expect(page.getByText(`${entry} added`, { exact: true })).toBeVisible();
      }
    });
  }
}

test('Working repeat-save clears the previous test answer and fixtures', async ({ page }) => {
  await openEditor(page, 'Working');
  const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
  const source = page.getByRole('textbox', { name: 'Scheme source' });
  const testAnswer = page.getByRole('textbox', { name: 'Test student answer' });
  await prompt.fill('What is 2 + 2?');
  await source.fill('[1] answer :: equals :: 4');
  await testAnswer.fill('4');
  await expect(page.getByText('1 / 1 marks', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pin as fixture' }).click();
  await page.getByRole('button', { name: 'Save & add another' }).click();
  await expect(prompt).toBeFocused();
  await expect(source).toHaveValue('');
  await expect(testAnswer).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Pinned fixtures' })).toBeHidden();
  await source.fill('[1] next :: equals :: 6');
  await expect(page.getByText('Line-by-line verdicts will appear here.')).toBeVisible();
});

test('Audio opens at attachment and repeats without starting the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw new Error('Recording must require explicit activation');
      },
    });
  });
  await openEditor(page, 'Audio');
  const choose = page.getByRole('button', { name: 'Choose file', exact: true });
  const prompt = page.getByRole('textbox', { name: 'Prompt (optional)' });
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  for (let entry = 1; entry <= 2; entry++) {
    await expect(choose).toBeFocused();
    // Valid PCM WAV silence, without relying on microphone hardware or permission.
    const wav = Buffer.alloc(46);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(38, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(2, 40);
    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: `clip-${entry}.wav`,
      mimeType: 'audio/wav',
      buffer: wav,
    });
    await expect(prompt).toBeFocused();
    await prompt.fill('Listen and translate');
    await page.keyboard.press('Tab');
    await expect(answer).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(prompt).toBeFocused();
    await page.keyboard.press('Tab');
    await answer.fill(`Answer ${entry}`);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Save & add another' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(answer).toHaveValue('');
    await expect(prompt).toHaveValue('');
    await expect(page.getByText(`${entry} added`, { exact: true })).toBeVisible();
  }
});

test('invalid numeric entry leaves secondary controls and reverse traversal available', async ({
  page,
}) => {
  await openEditor(page, 'Numeric answer');
  const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
  const answer = page.getByRole('textbox', { name: 'Expected answer' });
  await prompt.fill('What is 2 + 2?');
  await page.keyboard.press('Tab');
  await expect(answer).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Insert power' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(answer).toBeFocused();
  await answer.press('Control+Enter');
  await expect(page.getByRole('textbox', { name: 'Expected answer' })).toBeFocused();
  await page.getByRole('button', { name: 'Tolerance', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Plus or minus' }).fill('0.5');
  await page.getByRole('button', { name: 'One of', exact: true }).click();
  await page.getByRole('textbox', { name: 'Accepted answer 1' }).fill('4');
  await page.getByRole('button', { name: 'Add accepted answer', exact: true }).click();
  const alternative = page.getByRole('textbox', { name: 'Accepted answer 2' });
  await alternative.press('Control+Enter');
  await expect(alternative).toBeFocused();
  await alternative.fill('8 / 2');
  await alternative.press('Tab');
  await expect(page.getByRole('button', { name: 'Save & add another' })).toBeFocused();
});

test('Working suggestions own Tab and Enter while multiline entry remains available', async ({
  page,
}) => {
  await openEditor(page, 'Working');
  const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
  const source = page.getByRole('textbox', { name: 'Scheme source' });
  await prompt.fill('Solve 2x = 8');
  await source.fill('[');
  await source.press('Tab');
  await expect(source).toHaveValue('[1] ');
  await expect(source).toBeFocused();
  await source.fill('[1] answer :: equ');
  await source.press('Control+Enter');
  await expect(source).toHaveValue('[1] answer :: equals :: expression');
  await expect(page.getByText('1 added', { exact: true })).toBeHidden();
  await source.fill('[1] answer :: equals :: 4');
  await source.press('Enter');
  await expect(source).toHaveValue('[1] answer :: equals :: 4\n');
});

test('cloze retains two repeat-saves, its type and tags', async ({ page }) => {
  await openEditor(page, 'Cloze deletion');
  const text = page.getByRole('textbox', { name: 'Text (use the Cloze button to hide answers)' });
  await page.getByRole('textbox', { name: 'Add tags' }).fill('chemistry');
  await page.getByRole('textbox', { name: 'Add tags' }).press('Enter');
  for (let entry = 1; entry <= 2; entry++) {
    await text.fill(`Water is {{c1::H2O}}. Example ${entry}`);
    await text.press('Tab');
    await expect(page.getByRole('button', { name: 'Save & add another' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(text).toHaveValue('');
    await expect(text).toBeFocused();
    await expect(page.getByRole('button', { name: 'Cloze deletion', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('chemistry', { exact: true })).toBeVisible();
    await expect(page.getByText(`${entry} added`, { exact: true })).toBeVisible();
  }
});

test('failed numeric writes retain content for retry and route recovery', async ({ page }) => {
  await openEditor(page, 'Numeric answer');
  const editorUrl = page.url();
  const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
  const answer = page.getByRole('textbox', { name: 'Expected answer' });
  await prompt.fill('Retain this failed draft');
  await answer.fill('4');
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === 'cards') {
        IDBObjectStore.prototype.add = add;
        throw new DOMException('Test storage failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save & add another' }).click();
  await expect(
    page.getByText('Could not save the card. Try again.', { exact: true }),
  ).toBeVisible();
  await expect(prompt).toHaveValue('Retain this failed draft');
  await expect(answer).toHaveValue('4');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(localStorage).some((value) => value.includes('Retain this failed draft')),
      ),
    )
    .toBe(true);
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeAttached();
  await page.goto(editorUrl);
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(prompt).toHaveValue('Retain this failed draft');
  await expect(answer).toHaveValue('4');
  await page.getByRole('button', { name: 'Save & add another' }).click();
  await expect(prompt).toHaveValue('');
  await expect(page.getByText('1 added', { exact: true })).toBeVisible();
});

test('numeric Tab targets survive completed answer-type animations without editing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('lacuna.motionSpeed', 'normal'));
  await openEditor(page, 'Numeric answer');
  const prompt = page.getByRole('textbox', { name: 'Question', exact: true });
  const editor = page.getByRole('region', { name: 'Accepted answer' });
  await prompt.fill('What is 2 + 2?');
  await page.getByRole('textbox', { name: 'Expected answer' }).fill('4');
  for (const type of ['Tolerance', 'One of', 'Exact', 'Tolerance']) {
    const outgoingId = await editor.getByRole('textbox').getAttribute('id');
    expect(outgoingId).toBeTruthy();
    await page.getByRole('button', { name: type, exact: true }).click();
    await expect(editor.locator(`[id="${outgoingId}"]`)).toHaveCount(0);
    await expect(editor.locator('[inert]')).toHaveCount(0);
    const answer = page.getByRole('textbox', {
      name: type === 'One of' ? 'Accepted answer 1' : 'Expected answer',
      exact: true,
    });
    // Focusing preserves the untouched value; typing here would reattach the lost ref.
    await answer.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(prompt).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(answer).toBeFocused();
    await expect(answer).toHaveValue('4');
  }
});
