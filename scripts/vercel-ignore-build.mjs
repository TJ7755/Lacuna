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
  const current = env.VERCEL_GIT_COMMIT_SHA;
  if (!/^[a-f0-9]{40}$/.test(current ?? '')) return 1;

  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 });
  if (git('rev-parse', 'HEAD').trim() !== current) return 1;
  // Only the first line opts an intermediate commit out of a release batch.
  const subject = git('show', '-s', '--format=%B', current).split('\n', 1)[0].trimEnd();
  if (subject.endsWith(' [skip vercel]')) {
    console.log('Skipping intermediate deployment for the explicit release batch.');
    return 0;
  }
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  if (!/^[a-f0-9]{40}$/.test(previous ?? '')) return 1;
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
