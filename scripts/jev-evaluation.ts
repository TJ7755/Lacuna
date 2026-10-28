import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { callJevAllocationBatch, callJevDecision } from '../server/jev/provider';
import {
  JEV_MODEL,
  JEV_ALLOCATION_CONFIDENCE_THRESHOLD,
  jevDecisionResultSchema,
  jevAllocationBatchResultSchema,
} from '../src/jev/protocol';
import { JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD } from '../src/jev/diagnosis';
import { hash, validateLabels } from './jev-evaluation/labels';
import { cases, policy } from './jev-evaluation/pack';
import { summarise, type Observation } from './jev-evaluation/metrics';

const root = new URL('../', import.meta.url);
const sources = [
  'scripts/jev-evaluation.ts',
  'scripts/jev-evaluation/pack.ts',
  'scripts/jev-evaluation/labels.ts',
  'scripts/jev-evaluation/metrics.ts',
  'scripts/jev-evaluation/README.md',
  'server/jev/provider.ts',
  'server/jev/diagnosis.ts',
  'src/jev/protocol.ts',
  'src/jev/diagnosis.ts',
  'src/jev/answerParts.ts',
  'src/questions/techniqueTags.ts',
  'bun.lock',
  '.bun-version',
  'relay/scripts/security-bun.json',
];
async function identity() {
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sources.map(
        async (path) => [path, hash(await readFile(new URL(path, root), 'utf8'))] as const,
      ),
    ),
  );
  const versions = {
    model: JEV_MODEL,
    taxonomy: 'science-explanations@1',
    protocol: policy.version,
    markThreshold: JEV_ALLOCATION_CONFIDENCE_THRESHOLD,
    diagnosticThreshold: JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD,
    sourceHashes,
  };
  return { identity: hash(JSON.stringify({ cases, policy, versions })), versions };
}
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const writeNew = (path: string, value: unknown) =>
  writeFile(path, json(value), { flag: 'wx', mode: 0o600 });
async function createOutput(path: string) {
  await mkdir(dirname(path), { recursive: true });
  await mkdir(path, { mode: 0o700 });
}

async function main(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      labels: { type: 'string' },
      authority: { type: 'string' },
      'trust-sha256': { type: 'string' },
      'allow-paid': { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (positionals.length !== 1 || !['export', 'validate', 'live'].includes(command))
    throw new Error(
      'Use export --out NEW_DIRECTORY, or validate/live --labels FILE --authority FILE --trust-sha256 HASH; live also requires --allow-paid --out NEW_DIRECTORY.',
    );
  const pin = JSON.parse(
    await readFile(new URL('relay/scripts/security-bun.json', root), 'utf8'),
  ) as { revision: string };
  if (execFileSync(process.execPath, ['--revision'], { encoding: 'utf8' }).trim() !== pin.revision)
    throw new Error('Use the repository-pinned Bun revision.');
  const frozen = await identity();
  if (command === 'export') {
    if (!values.out) throw new Error('A new packet directory is required.');
    await createOutput(values.out);
    await writeNew(join(values.out, 'blind.json'), {
      identity: frozen.identity,
      instructions:
        'Review independently; do not inspect pack.ts, answer strata, other reviews or provider results. Complete the separate human record and sign its exact UTF-8 bytes.',
      cases: cases.map(({ id, request }) => ({ id, ...request })),
    });
    await writeNew(join(values.out, 'human-record-template.json'), {
      identity: frozen.identity,
      reviewerId: null,
      source: null,
      independent: null,
      contentApproved: null,
      completedAt: null,
      labels: cases.map(({ id }) => ({
        id,
        mark: null,
        knowledge: null,
        application: null,
        'causal-link': null,
        rationale: '',
      })),
    });
    await writeNew(join(values.out, 'manifest.json'), {
      ...frozen,
      policy,
      status: 'Human content review, labels and live evaluation pending.',
    });
    await writeFile(
      join(values.out, 'protocol.md'),
      await readFile(new URL('scripts/jev-evaluation/README.md', root)),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(`Blind packet exported: ${resolve(values.out)}; identity ${frozen.identity}`);
    return;
  }
  if (!values.labels || !values.authority || !values['trust-sha256'])
    throw new Error(
      'Complete signed human labels and an independently pinned authority document are required.',
    );
  const labelText = await readFile(values.labels, 'utf8');
  const authorityText = await readFile(values.authority, 'utf8');
  const labels = validateLabels(
    JSON.parse(labelText),
    authorityText,
    values['trust-sha256'],
    frozen.identity,
  );
  if (command === 'validate') {
    console.log(
      json({
        identity: frozen.identity,
        cases: labels.gold.length,
        disagreements: labels.disagreements,
        live: 'not run',
      }),
    );
    return;
  }
  if (!values['allow-paid'] || !values.out)
    throw new Error('Live calls require --allow-paid and a new output directory.');
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('TYPESAFE_API_KEY must be supplied through the environment.');
  await createOutput(values.out);
  const observations: Observation[] = cases.map(({ id }) => ({
    id,
    status: 'not-run',
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    httpStatus: null,
  }));
  const startedAt = new Date().toISOString();
  let sourceIntact = true;
  const save = async () => {
    await writeFile(
      join(values.out!, 'results.json'),
      json({
        ...frozen,
        policy,
        startedAt,
        updatedAt: new Date().toISOString(),
        executionStatus: !sourceIntact
          ? 'invalid-source'
          : observations.every((row) => row.status === 'ok')
            ? 'complete'
            : 'incomplete',
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: fileURLToPath(root),
          encoding: 'utf8',
        }).trim(),
        labelFileSha256: hash(labelText),
        authoritySha256: hash(authorityText),
        humanEvidence: labels,
        observations,
        report: summarise(labels.gold, observations),
        scope:
          'Direct provider only. Hosted rate limits, manual fallback and overrides require separate pupil-flow verification.',
      }),
      { mode: 0o600 },
    );
  };
  await save();
  for (const [index, item] of cases.entries()) {
    if (index >= policy.maximumRequests) throw new Error('Evaluation request bound exceeded.');
    const observation = observations[index];
    observation.status = 'in-flight';
    await save();
    const started = performance.now();
    const signal = AbortSignal.timeout(policy.timeoutMs);
    let attempted = false;
    const fetcher: typeof fetch = async (url, options) => {
      if (attempted) throw new Error('Retries are forbidden.');
      attempted = true;
      const response = await fetch(url, { ...options, cache: 'no-store', redirect: 'error' });
      observation.httpStatus = response.status;
      try {
        const usage = ((await response.clone().json()) as { usage?: Record<string, unknown> })
          .usage;
        const tokens = (value: unknown) =>
          typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
        observation.inputTokens = tokens(usage?.input_tokens);
        observation.outputTokens = tokens(usage?.output_tokens);
      } catch {
        /* No usage is known when the provider body cannot be read. */
      }
      return response;
    };
    try {
      if (item.request.maxMarks === 1) {
        const result = jevDecisionResultSchema.parse(
          await callJevDecision(
            { purpose: 'mark-allocation', ...item.request },
            key,
            signal,
            fetcher,
          ),
        );
        const { inputTokens, ...decision } = result;
        observation.inputTokens = inputTokens;
        observation.result = decision;
      } else {
        const result = jevAllocationBatchResultSchema.parse(
          await callJevAllocationBatch(
            { purpose: 'mark-allocation', allocations: [item.request] },
            key,
            signal,
            fetcher,
          ),
        );
        if (result.decisions.length !== 1) throw new Error('Invalid batch result count.');
        observation.inputTokens = result.inputTokens;
        observation.result = result.decisions[0];
      }
      observation.status = 'ok';
    } catch {
      observation.status = signal.aborted
        ? 'timeout'
        : observation.httpStatus === null
          ? 'network-error'
          : observation.httpStatus >= 400
            ? 'http-error'
            : 'invalid-response';
    }
    observation.latencyMs = Math.round(performance.now() - started);
    await save();
    if (observation.status !== 'ok') break;
  }
  if ((await identity()).identity !== frozen.identity) {
    sourceIntact = false;
    await save();
    throw new Error('Sources changed during evaluation; discard this run.');
  }
  if (observations.some((row) => row.status !== 'ok'))
    throw new Error('Evaluation stopped after a failed request; inspect the incomplete report.');
  console.log(`Saved bounded evaluation: ${resolve(values.out)}. #905 remains open.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error(
      'Evaluation refused or failed. Check the command, pinned runtime, signed human records and new output path. No credentials or provider error bodies are logged.',
    );
    process.exitCode = 1;
  });
}
