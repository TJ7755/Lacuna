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

export function checkDocs(directory = root) {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
    {
      cwd: directory,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter((file) => file && (file.startsWith('docs/') || !file.includes('/')));
  const problems = checkFileLinks(directory, [...new Set(files)]);
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
