import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { checkParameters } from 'ts-fsrs';
import type { OptimiseMessage } from '../../apps/web/src/workers/optimise.worker';

const root = resolve(import.meta.dirname, '../..');

test('ships the browser trainer matching binding 0.6', () => {
  // SHA-256 of the official binding-wasm32-wasi@0.6.0 npm artefact.
  const wasm = readFileSync(resolve(root, 'apps/web/src/assets/fsrs-binding.wasm32-wasi.wasm'));
  expect(createHash('sha256').update(wasm).digest('hex')).toBe(
    '4279f41bf156fe07c8cfb5f6a07d1ab64b34c848eb97b16abb65a4dbce796188',
  );
});

test('fits valid weights through the production browser WASI worker', async ({ page }) => {
  const workers = readdirSync(
    resolve(process.env.LACUNA_BROWSER_RUN_DIR ?? root, 'dist/assets'),
  ).filter((name) => /^optimise\.worker-[A-Za-z0-9_-]+\.js$/.test(name));
  expect(workers).toHaveLength(1);
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  const message = await page.evaluate<OptimiseMessage, string>(async (workerName) => {
    const worker = new Worker(`/assets/${workerName}`, { type: 'module' });
    try {
      return await new Promise<OptimiseMessage>((resolveMessage, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = (event: MessageEvent<OptimiseMessage>) => {
          if (event.data.type !== 'progress') resolveMessage(event.data);
        };
        const patterns = [
          [3, 3, 3, 4, 3],
          [3, 1, 3, 3, 2],
          [2, 3, 3, 1, 3, 3],
          [4, 4, 3, 3],
          [3, 1, 1, 3, 3, 4],
          [3, 3, 2, 3],
        ];
        // The worker consumes only card identity and review sequences. These
        // fixed histories match the native trainer regression's input shape.
        const cards = patterns.map((grades, cardIndex) => ({
          id: `browser-training-${cardIndex}`,
          history: grades.map((grade, reviewIndex) => ({
            grade,
            timestamp: Date.UTC(2026, 0, 1) + (cardIndex + reviewIndex * 2) * 86_400_000,
          })),
        }));
        worker.postMessage({ cards, requestRetention: 0.9 });
      });
    } finally {
      worker.terminate();
    }
  }, workers[0]);

  expect(message.type, JSON.stringify(message)).toBe('done');
  if (message.type !== 'done') throw new Error('The browser trainer did not return a fit.');
  expect(message.result.w).toHaveLength(21);
  expect(() => checkParameters(message.result.w)).not.toThrow();
  expect(Number.isFinite(message.result.before)).toBe(true);
  expect(Number.isFinite(message.result.after)).toBe(true);
  expect(message.result.scored).toBeGreaterThan(0);
});
