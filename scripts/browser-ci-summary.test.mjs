import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import BrowserCiSummary from './browser-ci-summary.mjs';

test('the real web reporter reports prerequisite failures and retries without a browser', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-browser-summary-'));
  const summary = join(directory, 'summary.md');
  const report = join(directory, 'results.json');
  try {
    writeFileSync(
      join(directory, 'probe.spec.mjs'),
      `
      import { test, expect } from ${JSON.stringify(fileURLToPath(import.meta.resolve('@playwright/test')))};
      test('passes', () => {});
      test('recovers on retry', async ({}, info) => {
        if (info.retry === 0) await test.step('Prerequisite: navigate to course', async () => {
          expect(false, 'Missing course link').toBe(true);
        });
      });
      test('checks rendering after navigation', async () => {
        await test.step('Prerequisite: enter study', async () => {
          await test.step('Find study link', async () => { expect(false).toBe(true); });
        });
      });
      test('expected failure', () => { test.fail(); expect(false).toBe(true); });
    `,
    );
    writeFileSync(
      join(directory, 'playwright.config.mjs'),
      `
      import config from ${JSON.stringify(fileURLToPath(new URL('../tests/config/playwright.web.config.ts', import.meta.url)))};
      export default {
        ...config, testDir: ${JSON.stringify(directory)}, webServer: undefined,
        outputDir: ${JSON.stringify(join(directory, 'test-results'))},
        workers: 1, projects: [{ name: 'diagnostics' }], use: {},
        reporter: config.reporter.map(([name, options]) => [name,
          name === 'html' ? { open: 'never', outputFolder: ${JSON.stringify(join(directory, 'html'))} } :
          name === 'json' ? { outputFile: ${JSON.stringify(report)} } : options]),
      };
    `,
    );
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('@playwright/test/cli')),
        'test',
        '-c',
        join(directory, 'playwright.config.mjs'),
      ],
      {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, CI: 'true', GITHUB_STEP_SUMMARY: summary, FORCE_COLOR: '0' },
      },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.error, undefined);
    assert.ok(result.stdout.includes('retry #1'));
    assert.ok(result.stdout.includes('::error'));
    const content = readFileSync(summary, 'utf8');
    assert.ok(
      content.includes('Run status: **failed**. 2 expected, 1 unexpected, 1 flaky, 0 skipped'),
    );
    assert.ok(content.includes('Prerequisite: navigate to course'));
    assert.ok(content.includes('Prerequisite: enter study &#62; Find study link'));
    assert.ok(content.includes('probe.spec.mjs:'));
    assert.ok(content.includes('attempt 2'));
    assert.ok(content.includes('expected: failed'));
    const json = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(json.stats.unexpected, 1);
    assert.equal(json.stats.flaky, 1);
    assert.ok(readFileSync(join(directory, 'html/index.html'), 'utf8').includes('<!DOCTYPE html>'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('summary bounds output, escapes markup and reports runner errors without claiming a stage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-browser-summary-'));
  const previous = process.env.GITHUB_STEP_SUMMARY;
  try {
    process.env.GITHUB_STEP_SUMMARY = join(directory, 'summary.md');
    const reporter = new BrowserCiSummary();
    for (let index = 0; index < 25; index++) {
      reporter.onTestEnd(
        {
          titlePath: () => ['<feature>|`', String(index)],
          expectedStatus: 'passed',
          location: { file: 'fixture.spec.ts', line: 12 },
          outcome: () => 'unexpected',
        },
        {
          status: 'timedOut',
          steps: [],
          errors: [{ message: '\u001b[31mSetup timed out\u001b[0m\nDetails' }],
          duration: 240_000,
          retry: 0,
        },
      );
    }
    reporter.onError({ message: 'Server <startup> failed' });
    reporter.onEnd({ status: 'failed' });
    const content = readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.ok(content.includes('5 further failed attempts omitted'));
    assert.ok(content.includes('&#60;feature&#62;&#124;&#96;'));
    assert.ok(content.includes('No failing step recorded; inspect the trace and error location'));
    assert.ok(content.includes('Setup timed out'));
    assert.ok(!content.includes('\u001b'));
    assert.ok(content.includes('Runner error: Server &#60;startup&#62; failed'));
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
