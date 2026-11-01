import { evidence, installations } from './local-checks.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.includes('--help') && args.length === 1) {
  console.log(
    'Usage: bun run setup\nVerifies the installed pinned Bun revision, then installs root, relay and handwriting dependencies with frozen lockfiles.\nFor a missing Bun runtime, use node apps/relay/scripts/security-bun.mjs --install and the printed local binary directory.',
  );
} else if (args.length) {
  console.error('Usage: bun run setup');
  process.exitCode = 1;
} else {
  process.exitCode = await evidence('setup', async ({ run }) => {
    for (const cwd of installations) await run('bun', ['install', '--frozen-lockfile'], cwd);
  });
}
