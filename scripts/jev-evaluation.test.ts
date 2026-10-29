import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { validateLabels, type Label } from './jev-evaluation/labels';
import { cases, type EvaluationCase } from './jev-evaluation/pack';
import { proportion, summarise, type Observation } from './jev-evaluation/metrics';

// Identities and marks below are synthetic test fixtures, never accuracy evidence.
const people = ['fixture-a', 'fixture-b', 'fixture-c'];
const labels: Label[] = cases.map(({ id }) => ({
  id,
  mark: 0,
  knowledge: 'insufficient-evidence',
  application: 'insufficient-evidence',
  'causal-link': 'insufficient-evidence',
  rationale: 'Synthetic fixture only.',
}));
function envelope(
  index: number,
  rows: unknown = labels,
  frozen = 'fixture-identity',
  source = 'agent',
) {
  return {
    identity: frozen,
    reviewerId: people[index],
    reviewReference: 'Synthetic independent reference review.',
    source,
    independent: true,
    contentApproved: true,
    completedAt: '2026-01-01T00:00:00Z',
    labels: rows,
  };
}
const bundle = () => ({ reviews: [envelope(0), envelope(1)] });
const directories: string[] = [];
const temporary = () => {
  const path = mkdtempSync(join(tmpdir(), 'jev-evaluation-synthetic-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('accepts a single complete independent agent reference review', () => {
  const record = envelope(0);
  const result = validateLabels({ reviews: [record] }, 'fixture-identity');
  expect(result.gold).toEqual(labels);
  expect(result.reviews[0].source).toBe('agent');
  expect(result.disagreements).toEqual([]);
});

test('requires complete reference records and preserves adjudicated disagreement', () => {
  const second = labels.map((row, index) => (index === 0 ? { ...row, mark: 1 } : row));
  const disputed = { reviews: [envelope(0), envelope(1, second)] };
  expect(() => validateLabels(disputed, 'fixture-identity')).toThrow(/adjudication/);
  const result = validateLabels(
    { ...disputed, adjudication: envelope(2, [second[0]]) },
    'fixture-identity',
  );
  expect(result.disagreements).toEqual([labels[0].id]);
  expect(result.gold[0].mark).toBe(1);
  expect(result.reviews.map((review) => review.labels[0].mark)).toEqual([0, 1]);
  expect(result.reviews).toEqual(disputed.reviews);
});

test.each([
  ['missing review', () => ({ reviews: [] })],
  ['incomplete review', () => ({ reviews: [envelope(0, labels.slice(1)), envelope(1)] })],
  [
    'duplicate case',
    () => ({ reviews: [envelope(0, [...labels.slice(1), labels[1]]), envelope(1)] }),
  ],
  [
    'unknown case',
    () => ({
      reviews: [
        envelope(
          0,
          labels.map((row, index) => (index ? row : { ...row, id: 'unknown' })),
        ),
        envelope(1),
      ],
    }),
  ],
  [
    'out-of-range mark',
    () => ({
      reviews: [
        envelope(
          0,
          labels.map((row, index) => (index ? row : { ...row, mark: 9 })),
        ),
        envelope(1),
      ],
    }),
  ],
  [
    'model label',
    () => ({ reviews: [envelope(0, labels, 'fixture-identity', 'model'), envelope(1)] }),
  ],
  ['same reviewer twice', () => ({ reviews: [envelope(0), envelope(0)] })],
  ['stale identity', () => ({ reviews: [envelope(0, labels, 'old'), envelope(1)] })],
  ['extra adjudication', () => ({ ...bundle(), adjudication: envelope(2, [labels[0]]) })],
  [
    'absent category',
    () => ({
      reviews: [
        envelope(
          0,
          labels.map(({ application: _application, ...row }) => row),
        ),
        envelope(1),
      ],
    }),
  ],
  [
    'gap on blank',
    () => ({
      reviews: [
        envelope(
          0,
          labels.map((row) =>
            cases.find((item) => item.id === row.id)!.stratum === 'blank'
              ? { ...row, knowledge: 'gap' }
              : row,
          ),
        ),
        envelope(1),
      ],
    }),
  ],
])('rejects %s before evaluation', (_name, input) => {
  expect(() => validateLabels(input(), 'fixture-identity')).toThrow();
});

test('requires review provenance and a separate adjudicator', () => {
  expect(() =>
    validateLabels(
      { reviews: [{ ...envelope(0), reviewReference: '' }, envelope(1)] },
      'fixture-identity',
    ),
  ).toThrow();
  const second = labels.map((row, index) => (index === 0 ? { ...row, mark: 1 } : row));
  expect(() =>
    validateLabels(
      { reviews: [envelope(0), envelope(1, second)], adjudication: envelope(0, [second[0]]) },
      'fixture-identity',
    ),
  ).toThrow(/separate/);
});

test('reports independently specified errors, unavailable cases and uncertainty without treating abstentions as marks', () => {
  const gold = labels.map((row) => ({ ...row }));
  const multi = cases.findIndex((row) => row.request.maxMarks === 2);
  gold[multi].mark = 2;
  const observations: Observation[] = cases.map(({ id }) => ({
    id,
    status: 'ok',
    latencyMs: 10,
    inputTokens: 7,
    outputTokens: 0,
    httpStatus: 200,
    result: {
      value: 0,
      confidence: 0.99,
      model: 'jev-1.14.0',
      diagnosis: {
        taxonomyId: 'science-explanations',
        taxonomyVersion: 1,
        decisions: ['knowledge', 'application', 'causal-link'].map((categoryId) => ({
          categoryId: categoryId as 'knowledge' | 'application' | 'causal-link',
          outcome: 'insufficient-evidence',
          confidence: 1,
        })),
      },
    },
  }));
  const other = cases.findIndex((_, index) => index !== multi);
  observations[other].result!.value = 1;
  const report = summarise(gold, observations);
  expect(report.overall.markAgreement).toMatchObject({ count: 22, total: 24, rate: 22 / 24 });
  expect(report.overall.overmarks.count).toBe(1);
  expect(report.overall.undermarks.count).toBe(1);
  expect(report.overall.errorsExceedingOneMark).toMatchObject({ count: 1, total: 12 });
  expect(report.telemetry.knownInputTokens).toBe(168);
  expect(report.failures).toHaveLength(2);
  expect(report.byAnswerType['multi-mark'].decision).toBe('undersampled');
  observations[other].result!.value = null;
  observations[multi] = {
    ...observations[multi],
    status: 'timeout',
    result: undefined,
    inputTokens: null,
  };
  const unavailable = summarise(gold, observations);
  expect(unavailable.overall.decided).toBe(22);
  expect(unavailable.overall.abstention.count).toBe(1);
  expect(unavailable.overall.unavailable.count).toBe(1);
  expect(
    unavailable.overall.categories.knowledge.outcomes['insufficient-evidence'].recall,
  ).toMatchObject({ count: 23, total: 24 });
  expect(unavailable.telemetry.unknownInputTokenRequests).toBe(1);
  expect(proportion(0, 0).rate).toBeNull();
  expect(proportion(0, 100).upper95).toBeCloseTo(0.03699, 4);
  gold[other].knowledge = 'gap';
  observations[other].result!.diagnosis!.decisions[0].outcome = 'gap';
  const falsePositive = cases.findIndex((_, index) => index !== multi && index !== other);
  observations[falsePositive].result!.diagnosis!.decisions[0].outcome = 'gap';
  const diagnostic = summarise(gold, observations).overall.categories.knowledge;
  expect(diagnostic.outcomes.gap.precision).toMatchObject({ count: 1, total: 2, rate: 0.5 });
  expect(diagnostic.outcomes.gap.recall).toMatchObject({ count: 1, total: 1, rate: 1 });
  expect(diagnostic.confidentErrors.count).toBe(1);
  expect(() => summarise(gold, observations.slice(1))).toThrow(/exactly one/);
});

test.each([
  [12, 'candidate-for-independent-review'],
  [18, 'fails-predefined-criteria'],
])('screens %i abstentions per 300 cases against the 5% requirement', (abstentions, decision) => {
  const outcomes = ['gap', 'no-gap', 'insufficient-evidence'] as const;
  const categories = ['knowledge', 'application', 'causal-link'] as const;
  const pack: EvaluationCase[] = [1, 2].flatMap((maxMarks) =>
    Array.from({ length: 300 }, (_, index) => ({
      id: `synthetic-${maxMarks}-${index}`,
      questionId: `synthetic-${maxMarks}-${Math.floor(index / 12)}`,
      answerType: maxMarks === 1 ? ('short-answer' as const) : ('multi-mark' as const),
      stratum: 'partial' as const,
      request: { ...cases[0].request, maxMarks, answer: 'Synthetic metrics fixture only.' },
    })),
  );
  const gold: Label[] = pack.map(({ id }, index) => ({
    id,
    mark: 0,
    knowledge: outcomes[index % 3],
    application: outcomes[Math.floor(index / 3) % 3],
    'causal-link': outcomes[Math.floor(index / 9) % 3],
    rationale: 'Synthetic metrics fixture, not marking evidence.',
  }));
  const observations: Observation[] = pack.map(({ id }, index) => ({
    id,
    status: 'ok',
    latencyMs: 1,
    inputTokens: 0,
    outputTokens: 0,
    httpStatus: 200,
    result: {
      value: index % 300 < abstentions ? null : 0,
      confidence: 1,
      model: 'jev-1.14.0',
      diagnosis: {
        taxonomyId: 'science-explanations',
        taxonomyVersion: 1,
        decisions: categories.map((categoryId) => ({
          categoryId,
          outcome: gold[index][categoryId],
          confidence: 1,
        })),
      },
    },
  }));
  const report = summarise(gold, observations, pack);
  for (const type of ['short-answer', 'multi-mark']) {
    expect(report.byAnswerType[type].decision).toBe(decision);
    expect(report.byAnswerType[type].abstention.rate).toBe(abstentions / 300);
  }
});

test('rejects unsupported allocations above two marks before creating a reference packet', () => {
  const directory = temporary();
  const item = cases.find((row) => row.request.maxMarks === 2)!;
  const path = join(directory, 'unsupported.json');
  writeFileSync(path, JSON.stringify([{ ...item, request: { ...item.request, maxMarks: 3 } }]));
  const result = spawnSync(
    'bun',
    ['scripts/jev-evaluation.ts', 'export', '--cases', path, '--out', join(directory, 'packet')],
    { encoding: 'utf8', timeout: 10_000 },
  );
  expect(result.status).not.toBe(0);
});

test('blind CLI export is reproducible, unmarked and refuses overwrites; incomplete labels cannot reach fetch', () => {
  const directory = join(temporary(), 'new-parent');
  const cli = (args: string[], preload?: string) =>
    spawnSync(
      'bun',
      [...(preload ? ['--preload', preload] : []), 'scripts/jev-evaluation.ts', ...args],
      { encoding: 'utf8', timeout: 10_000 },
    );
  for (const name of ['one', 'two'])
    expect(cli(['export', '--out', join(directory, name)]).status).toBe(0);
  const first = readFileSync(join(directory, 'one/blind.json'), 'utf8');
  expect(first).toBe(readFileSync(join(directory, 'two/blind.json'), 'utf8'));
  const blind = JSON.parse(first);
  expect(blind.cases).toHaveLength(24);
  expect(
    blind.cases.every(
      (row: Record<string, unknown>) =>
        !('stratum' in row) && !('mark' in row) && !('questionId' in row),
    ),
  ).toBe(true);
  expect(cli(['export', '--out', join(directory, 'one')]).status).not.toBe(0);
  const frozen = JSON.parse(readFileSync(join(directory, 'one/manifest.json'), 'utf8'));
  expect(blind.identity).toBe(frozen.identity);
  writeFileSync(
    join(directory, 'labels.json'),
    JSON.stringify({
      reviews: [
        envelope(0, labels.slice(1), frozen.identity),
        envelope(1, labels, frozen.identity),
      ],
    }),
  );
  const preload = join(directory, 'forbid-network.ts');
  writeFileSync(
    preload,
    'globalThis.fetch = () => { console.error("UNEXPECTED_NETWORK"); throw new Error("forbidden"); };',
  );
  const absent = cli(['live', '--allow-paid', '--out', join(directory, 'absent')], preload);
  expect(absent.status).not.toBe(0);
  expect(absent.stderr).not.toContain('UNEXPECTED_NETWORK');
  const invalid = cli(
    [
      'live',
      '--labels',
      join(directory, 'labels.json'),
      '--allow-paid',
      '--out',
      join(directory, 'invalid'),
    ],
    preload,
  );
  expect(invalid.status).not.toBe(0);
  expect(invalid.stderr).not.toContain('UNEXPECTED_NETWORK');
});

test('synthetic transport exercises both provider entry points, records real usage fields and stops on HTTP errors without retries', () => {
  const directory = temporary();
  expect(
    spawnSync('bun', ['scripts/jev-evaluation.ts', 'export', '--out', join(directory, 'packet')], {
      encoding: 'utf8',
      timeout: 10_000,
    }).status,
  ).toBe(0);
  const frozen = JSON.parse(readFileSync(join(directory, 'packet/manifest.json'), 'utf8'));
  writeFileSync(
    join(directory, 'labels.json'),
    JSON.stringify({
      reviews: [envelope(0, labels, frozen.identity), envelope(1, labels, frozen.identity)],
    }),
  );
  const preload = join(directory, 'synthetic-transport.ts');
  writeFileSync(
    preload,
    `
    globalThis.fetch = async (_url, options) => {
      if (options.cache !== 'no-store' || options.redirect !== 'error' || !options.signal) throw new Error('Unbounded request');
      const body = JSON.parse(options.body);
      if (process.env.SYNTHETIC_MODE === 'http-error') return new Response('', {status: 429});
      if (process.env.SYNTHETIC_MODE === 'timeout') throw new DOMException('Synthetic timeout', 'AbortError');
      const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => [key,
        question.type === 'choice' ? /^\\d+$/.test(Object.keys(question.criteria)[0])
          ? {type:'choice',choice:'0',confidence:1,probabilities:Object.fromEntries(Object.keys(question.criteria).map(key => [key,key === '0' ? 1 : 0]))}
          : {type: 'choice', choice: 'insufficient-evidence', confidence: 1,
            probabilities: {gap: 0, 'no-gap': 0, 'insufficient-evidence': 1}}
        : question.type === 'noul' ? {type: 'noul', noul: 0.01}
        : (() => {throw new Error('Unexpected primitive')})()
      ]));
      return Response.json({model: 'jev-1.14.0', answers, usage: {input_tokens: 9, output_tokens: 0}});
    };
    if (process.env.SYNTHETIC_MODE === 'timeout') AbortSignal.timeout = () => AbortSignal.abort();`,
  );
  const externalCases = [
    cases.find((item) => item.request.maxMarks === 1)!,
    cases.find((item) => item.request.maxMarks === 2)!,
  ].map((item, index) => ({ ...item, id: `fresh-case-${index}` }));
  const externalPath = join(directory, 'fresh-cases.json');
  writeFileSync(
    externalPath,
    JSON.stringify(
      externalCases.map(({ id, questionId, answerType, stratum, request }) => ({
        request: Object.fromEntries(Object.entries(request).reverse()),
        stratum,
        answerType,
        questionId: ` ${questionId} `,
        id: ` ${id} `,
      })),
    ),
  );
  const freshPacket = join(directory, 'fresh-packet');
  expect(
    spawnSync(
      'bun',
      ['scripts/jev-evaluation.ts', 'export', '--cases', externalPath, '--out', freshPacket],
      { encoding: 'utf8', timeout: 10_000 },
    ).status,
  ).toBe(0);
  const freshIdentity = JSON.parse(
    readFileSync(join(freshPacket, 'manifest.json'), 'utf8'),
  ).identity;
  const freshLabels = externalCases.map(({ id }) => ({ ...labels[0], id }));
  const freshLabelPath = join(directory, 'fresh-labels.json');
  writeFileSync(
    freshLabelPath,
    JSON.stringify({ reviews: [envelope(0, freshLabels, freshIdentity)] }),
  );
  for (const mode of ['success', 'fresh-success', 'http-error', 'timeout']) {
    const external = mode === 'fresh-success';
    const error = mode === 'http-error' || mode === 'timeout';
    const count = external ? externalCases.length : cases.length;
    const output = join(directory, mode);
    const run = spawnSync(
      'bun',
      [
        '--preload',
        preload,
        'scripts/jev-evaluation.ts',
        'live',
        ...(external ? ['--cases', externalPath] : []),
        '--labels',
        external ? freshLabelPath : join(directory, 'labels.json'),
        '--allow-paid',
        '--out',
        output,
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, TYPESAFE_API_KEY: 'synthetic-test-value', SYNTHETIC_MODE: mode },
      },
    );
    expect(run.stderr).not.toContain('synthetic-test-value');
    expect(run.status).toBe(error ? 1 : 0);
    const result = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
    expect(result.report.telemetry.attempted).toBe(error ? 1 : count);
    expect(result.observations[0].status).toBe(error ? mode : 'ok');
    expect(result.report.telemetry.knownInputTokens).toBe(error ? 0 : 9 * count);
    expect(result.report.telemetry.unknownInputTokenRequests).toBe(error ? 1 : 0);
    expect(result.observations.filter((row: Observation) => row.status === 'not-run')).toHaveLength(
      error ? count - 1 : 0,
    );
    if (external) {
      expect(result.observations.map((row: Observation) => row.id)).toEqual(
        externalCases.map(({ id }) => id),
      );
      expect(result.report.overall.count).toBe(2);
      expect(result.report.byAnswerType['short-answer'].count).toBe(1);
      expect(result.report.byAnswerType['multi-mark'].count).toBe(1);
      const edited = externalCases.map((item, index) =>
        index
          ? item
          : {
              ...item,
              request: { ...item.request, answer: 'Changed after independent labelling' },
            },
      );
      writeFileSync(externalPath, JSON.stringify(edited));
      const stale = spawnSync(
        'bun',
        [
          '--preload',
          preload,
          'scripts/jev-evaluation.ts',
          'live',
          '--cases',
          externalPath,
          '--labels',
          freshLabelPath,
          '--allow-paid',
          '--out',
          join(directory, 'stale'),
        ],
        {
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...process.env, TYPESAFE_API_KEY: 'synthetic-test-value' },
        },
      );
      expect(stale.status).toBe(1);
      expect(() => readFileSync(join(directory, 'stale/results.json'))).toThrow();
    }
    expect(readFileSync(join(output, 'results.json'), 'utf8')).not.toContain(
      'synthetic-test-value',
    );
  }
});
