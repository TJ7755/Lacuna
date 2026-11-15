import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { runPackagedInteractionSample } from '../../scripts/electron-performance/renderer-interactions';
import type { RunningPackagedApp } from '../../scripts/electron-performance/types';

test('packaged renderer reset reports swallowed Escape without retrying dismissal', async ({
  page,
}) => {
  await enterWithWelcomeCourse(page);
  const running = { page, errors: [] } as unknown as RunningPackagedApp;
  await runPackagedInteractionSample({ running, executablePath: '', scenario: 'search' });
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'Quick search', exact: true });
  await expect(dialog).toBeHidden();

  await runPackagedInteractionSample({ running, executablePath: '', scenario: 'search' });
  await dialog.getByRole('combobox').evaluate((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
  page.setDefaultTimeout(500);
  const failure = await runPackagedInteractionSample({
    running,
    executablePath: '',
    scenario: 'settings',
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const message = (failure as Error).message;
  expect(message).toContain('Quick search Escape dismissal failed: ');
  const evidence = JSON.parse(message.slice(message.indexOf(': ') + 2));
  expect(evidence.before.comboboxFocused).toBe(true);
  expect(evidence.events).toEqual([
    expect.objectContaining({
      type: 'keydown',
      key: 'Escape',
      composing: false,
      trusted: true,
      target: expect.objectContaining({ role: 'combobox', inQuickSearch: true }),
      defaultPreventedAtCapture: false,
      defaultPreventedAfterDispatch: true,
    }),
    expect.objectContaining({ type: 'keyup', key: 'Escape', trusted: true }),
  ]);
  expect(evidence.after.comboboxFocused).toBe(true);
  await expect(dialog).toBeVisible();
});
