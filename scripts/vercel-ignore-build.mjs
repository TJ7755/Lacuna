import { execFileSync } from 'node:child_process';
import { classifyPaths, parseNameStatus } from './ci-change-scope.mjs';

// Vercel's ignored-build contract is 0 = skip, 1 = build.
// https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha
function decision() {
  const project = process.argv[2];
  if (!['lacuna', 'relay', 'gaps', 'library'].includes(project)) return 1;
  const env = process.env;
  if (env.VERCEL_ENV === 'preview') {
    // Preserve the verified root project's two dashboard preview exceptions.
    return project === 'lacuna' &&
      ['redesign/direction-c', 'feature/594-gaps'].includes(env.VERCEL_GIT_COMMIT_REF)
      ? 1
      : 0;
  }
  if (env.VERCEL_ENV !== 'production') return 1;
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const current = env.VERCEL_GIT_COMMIT_SHA;
  if (![previous, current].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) return 1;

  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 });
  if (git('rev-parse', '--is-shallow-repository').trim() !== 'false') return 1;
  if (git('rev-parse', 'HEAD').trim() !== current) return 1;
  git('merge-base', '--is-ancestor', previous, current);
  const changes = git(
    'diff',
    '--no-ext-diff',
    '--name-status',
    '-z',
    '-M',
    previous,
    current,
    '--',
  );
  // Empty/unknown input retains the classifier's full scope. Both rename
  // endpoints matter, including when a source file moves into documentation.
  const scope = classifyPaths(changes ? parseNameStatus(changes) : []);
  // All three frontends run root typechecking; its source tests also import
  // relay code. Keep that shared build dependency rather than splitting by folder.
  const affected =
    project === 'relay' ? scope.relay : scope.app || scope.sites || scope.electron || scope.tooling;
  return affected ? 1 : 0;
}

try {
  process.exitCode = decision();
} catch {
  console.error('Cannot prove this project is unaffected; build required.');
  process.exitCode = 1;
}
