import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

function eyebrowClasses(source: string) {
  const literals = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  const hasWideTracking = (className: string) => {
    if (/^tracking-(?:wide|wider|widest)$/.test(className)) return true;
    const arbitrary = /^tracking-\[(\d*\.?\d+)em\]$/.exec(className);
    return arbitrary !== null && Number(arbitrary[1]) >= 0.08;
  };

  return [...source.matchAll(literals)].flatMap((match) => {
    const classes = match[2].split(/\s+/);
    return classes.includes('uppercase') && classes.some(hasWideTracking) ? [match[2]] : [];
  });
}

it('does not pair uppercase captions with wide tracking', () => {
  const offenders = tsxFiles(sourceRoot).flatMap((path) =>
    eyebrowClasses(readFileSync(path, 'utf8')).map((className) =>
      `${relative(sourceRoot, path)}: ${className}`,
    ),
  );

  expect(offenders).toEqual([]);
});
