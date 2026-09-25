import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exchangeCredential, loadAccessConfiguration, verifySessionToken } from '../server/ai/access';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'lacuna-invites-'));
  directories.push(cwd);
  const run = (...args: string[]) => spawnSync(process.execPath, [resolve('scripts/ai-invites.mjs'), ...args], {
    cwd, encoding: 'utf8',
  });
  return { cwd, run };
}

it('creates private, individually usable codes without printing secrets', () => {
  const { cwd, run } = fixture();
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  const root = join(cwd, '.ai-invites');
  const batch = join(root, readdirSync(root)[0]!);
  const csv = readFileSync(join(batch, 'codes.csv'), 'utf8');
  const hashes = readFileSync(join(batch, 'credential-hashes.json'), 'utf8');
  const configuration = loadAccessConfiguration({
    AI_ACCESS_CREDENTIAL_HASHES: hashes, AI_SESSION_SIGNING_KEY: 's'.repeat(32),
  })!;
  expect(configuration).not.toBeNull();
  const rows = csv.trim().split('\n').slice(1);
  expect(rows).toHaveLength(20);
  const codes = rows.map((row) => row.split(',')[1]);
  expect(new Set(codes).size).toBe(20);
  for (const row of rows) {
    const [id, code] = row.split(',') as [string, string];
    const session = exchangeCredential(code, configuration)!;
    expect(verifySessionToken(session.token, configuration)).toBe(id);
    expect(hashes).not.toContain(code);
    expect(result.stdout + result.stderr).not.toContain(code);
  }
  if (process.platform !== 'win32') {
    expect(statSync(batch).mode & 0o777).toBe(0o700);
    for (const file of readdirSync(batch)) expect(statSync(join(batch, file)).mode & 0o777).toBe(0o600);
  }
});

it('preserves existing credentials and leaves earlier batches untouched', () => {
  const { cwd, run } = fixture();
  expect(run('--count', '2').status).toBe(0);
  const root = join(cwd, '.ai-invites');
  const first = join(root, readdirSync(root)[0]!, 'credential-hashes.json');
  const original = readFileSync(first, 'utf8');
  expect(run('--count', '3', '--existing', first).status).toBe(0);
  const next = readdirSync(root).map((name) => join(root, name, 'credential-hashes.json')).find((path) => path !== first)!;
  const merged = JSON.parse(readFileSync(next, 'utf8'));
  expect(merged).toMatchObject(JSON.parse(original));
  expect(Object.keys(merged)).toHaveLength(5);
  expect(readFileSync(first, 'utf8')).toBe(original);
});

it.each(['0', '-1', '1.5', '1001', 'nope'])('rejects invalid batch size %s before writing', (count) => {
  const { cwd, run } = fixture();
  const result = run(`--count=${count}`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Count must be an integer between 1 and 1000.');
  expect(readdirSync(cwd)).toEqual([]);
});

it('rejects malformed existing configuration without exposing its contents', () => {
  const { cwd, run } = fixture();
  const file = join(cwd, 'existing.json');
  writeFileSync(file, '{"learner":"private-invalid-value"}');
  const result = run('--existing', file);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Invalid existing credential configuration');
  expect(result.stdout + result.stderr).not.toContain('private-invalid-value');
  expect(readdirSync(cwd)).toEqual(['existing.json']);
});

it('rejects oversized new and combined configurations before writing', () => {
  const { cwd, run } = fixture();
  const large = run('--count', '1000');
  expect(large.status).toBe(1);
  expect(large.stderr).toContain('48 KiB');
  expect(readdirSync(cwd)).toEqual([]);
  const file = join(cwd, 'existing.json');
  writeFileSync(file, JSON.stringify(Object.fromEntries(
    Array.from({ length: 650 }, (_, index) => [`learner_${index}`, 'a'.repeat(64)]),
  )));
  const merged = run('--count', '1', '--existing', file);
  expect(merged.status).toBe(1);
  expect(merged.stderr).toContain('48 KiB');
  expect(readdirSync(cwd)).toEqual(['existing.json']);
});
