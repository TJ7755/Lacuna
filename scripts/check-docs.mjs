import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function prose(text) {
  let fence;
  return text
    .split('\n')
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return '';
      }
      return fence ? '' : line.replace(/(`+).*?\1/g, '');
    })
    .join('\n');
}

/** Check inline/image links and reference definitions, without fetching external URLs. */
export function checkFileLinks(directory, files) {
  const problems = [];
  for (const file of files) {
    if (basename(file).toUpperCase() === 'MEMORIES.MD' || !existsSync(resolve(directory, file)))
      continue;
    const text = prose(readFileSync(resolve(directory, file), 'utf8'));
    const patterns = [
      /!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g,
      /^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>]+)>|(\S+))/gm,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const target = match[1] ?? match[2];
        if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
        const location = `${file}:${text.slice(0, match.index).split('\n').length}`;
        let path;
        try {
          path = decodeURIComponent(target.split(/[?#]/, 1)[0]);
        } catch {
          problems.push(`${location}: invalid URL escape in ${target}`);
          continue;
        }
        if (!path) continue;
        const destination = path.startsWith('/')
          ? resolve(directory, `.${path}`)
          : resolve(directory, dirname(file), path);
        const within = relative(resolve(directory), destination);
        if (within === '..' || within.startsWith(`..${sep}`) || !existsSync(destination)) {
          problems.push(`${location}: missing repository target ${target}`);
        }
      }
    }
  }
  return problems;
}

// Pull requests and Git already retain review captures and change notes.
const RETIRED_DIRECTORIES = ['docs/changes/', 'docs/review/', 'docs/review-evidence/'];

/** Reject files under directories whose content belongs in a pull request, not the repository. */
export function checkRetiredPaths(files) {
  return files
    .filter((file) => RETIRED_DIRECTORIES.some((directory) => file.startsWith(directory)))
    .map((file) => `${file}: attach PR evidence and change notes to the pull request instead`);
}

export function checkDocs(directory = root) {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'docs', '*.md'],
    {
      cwd: directory,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter((file) => file && existsSync(resolve(directory, file)));
  const documents = files.filter(
    (file) => file.endsWith('.md') && (file.startsWith('docs/') || !file.includes('/')),
  );
  const problems = [
    ...checkRetiredPaths(files),
    ...checkFileLinks(directory, [...new Set(documents)]),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
  console.log('Documentation file links pass');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkDocs();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
