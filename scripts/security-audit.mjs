import { spawnSync } from 'node:child_process';
import { JSONC, file } from 'bun';

const advisory = 'GHSA-fc5q-39xc-vjpf';
const version = 'picomatch@4.0.7';
const expires = '2026-12-02T00:00:00Z';
const audit = (...args) => {
  const result = spawnSync(process.execPath, ['audit', '--audit-level=high', ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const fullStatus = audit();
if (fullStatus !== 1 || Date.now() >= Date.parse(expires)) process.exit(fullStatus);

// Only waive this advisory for the reviewed resolution, never a second version.
const lock = JSONC.parse(await file(new URL('../bun.lock', import.meta.url)).text());
const resolutions = Object.values(lock.packages)
  .map(([resolution]) => resolution)
  .filter((resolution) => resolution.startsWith('picomatch@'));
if (resolutions.length === 0 || resolutions.some((resolution) => resolution !== version)) {
  process.exit(fullStatus);
}

const productionStatus = audit('--prod');
if (productionStatus !== 0) process.exit(productionStatus);

console.warn(
  `Temporary tooling exception for ${version} (${advisory}) until ${expires}. Owner: TJ7755.`,
);
process.exit(audit('--ignore', advisory));
