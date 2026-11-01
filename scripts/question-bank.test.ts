import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('audits exact Course bytes and bank family templates without rewriting the source or an existing output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-classification-audit-'));
  try {
    const bankPath = 'docs/question-bank/examples/numeric-family.json';
    const bankBytes = await readFile(bankPath);
    const bank = spawnSync('bun', ['scripts/question-bank.ts', 'audit', bankPath], {
      encoding: 'utf8',
    });
    expect(bank.status, bank.stderr).toBe(0);
    const report = JSON.parse(bank.stdout);
    expect(report.artefact.sha256).toBe(createHash('sha256').update(bankBytes).digest('hex'));
    expect(report.basis).toBe('static-sets-and-family-templates');
    expect(report.totals).toMatchObject({ sets: 1, questions: 1 });
    expect(await readFile(bankPath)).toEqual(bankBytes);

    const file = join(directory, 'course.lacuna');
    const text = JSON.stringify({
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: {
        v: 6,
        questionSetPracticeNodes: [],
        at: 1,
        li: 'stable-lineage',
        rv: 7,
        course: { n: 'Audit', o: 0, c: 1, e: 2, um: 'open' },
        lessons: [],
        concepts: [],
        questions: [],
        questionSets: [],
      },
    });
    await writeFile(file, text);
    const output = join(directory, 'report.json');
    const course = spawnSync('bun', ['scripts/question-bank.ts', 'audit', file, output], {
      encoding: 'utf8',
    });
    expect(course.status, course.stderr).toBe(0);
    expect(JSON.parse(await readFile(output, 'utf8'))).toMatchObject({
      artefact: {
        lineageId: 'stable-lineage',
        revision: 7,
        sha256: createHash('sha256').update(text).digest('hex'),
      },
      basis: 'stored-question-sets',
      totals: { criteria: 0 },
    });
    const refused = spawnSync('bun', ['scripts/question-bank.ts', 'audit', file, file], {
      encoding: 'utf8',
    });
    expect(refused.status).toBe(1);
    expect(await readFile(file, 'utf8')).toBe(text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
