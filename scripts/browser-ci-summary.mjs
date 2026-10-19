import { appendFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

const inline = (value) =>
  String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[&<>`|]/g, (character) => `&#${character.charCodeAt(0)};`);

function deepestFailure(steps, parents = []) {
  for (const step of steps) {
    const path = [...parents, step];
    const child = deepestFailure(step.steps, path);
    if (child) return child;
    if (step.error) return path;
  }
}

// Supplements the built-in reporters; it never changes test outcomes or budgets.
export default class BrowserCiSummary {
  tests = new Set();
  attempts = [];
  errors = [];

  onTestEnd(test, result) {
    this.tests.add(test);
    if (result.status === 'passed' || result.status === 'skipped') return;
    const path = deepestFailure(result.steps);
    const location = path?.at(-1)?.location ?? test.location;
    this.attempts.push({
      title: test.titlePath().filter(Boolean).join(' > '),
      status: result.status,
      expected: test.expectedStatus,
      retry: result.retry,
      duration: result.duration,
      step:
        path?.map((step) => step.title).join(' > ') ??
        'No failing step recorded; inspect the trace and error location',
      location: `${location.file}:${location.line}`,
      error: stripVTControlCharacters(result.errors[0]?.message ?? '')
        .trim()
        .split('\n')[0],
    });
  }

  onError(error) {
    this.errors.push(error.message ?? String(error));
  }

  onEnd(result) {
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    const outcomes = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
    for (const test of this.tests) outcomes[test.outcome()]++;
    const lines = [
      '### Browser test diagnostics',
      '',
      `Run status: **${inline(result.status)}**. ${outcomes.expected} expected, ${outcomes.unexpected} unexpected, ${outcomes.flaky} flaky, ${outcomes.skipped} skipped tests observed.`,
      '',
      'Failed attempts below include retries and expected failures. A feature title alone does not identify the stage that failed.',
      '',
    ];
    for (const attempt of this.attempts.slice(0, 20)) {
      lines.push(
        `- **${inline(attempt.title)}** — ${inline(attempt.status)}, attempt ${attempt.retry + 1}, ${(attempt.duration / 1000).toFixed(1)} s (expected: ${inline(attempt.expected)}).`,
        `  - Step: ${inline(attempt.step)}`,
        `  - Location: ${inline(attempt.location)}`,
        `  - Error: ${inline(attempt.error)}`,
      );
    }
    if (this.attempts.length > 20)
      lines.push(
        `- ${this.attempts.length - 20} further failed attempts omitted; see the uploaded browser evidence.`,
      );
    for (const error of this.errors.slice(0, 5))
      lines.push(`- Runner error: ${inline(error).slice(0, 1000)}`);
    lines.push(
      '',
      'Full errors, traces and per-attempt timings remain in the uploaded browser evidence.',
      '',
    );
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }
}
