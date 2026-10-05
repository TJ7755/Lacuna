import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx|css)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe('design rules', () => {
  // The landing page keeps its own typographic voice; the app never shouts.
  it('sets no all-caps labels in the app', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !relative(SRC, path).startsWith(join('pages', 'landing')))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        // A capitals class or rule, or text typed in capitals (two words or more).
        return /\buppercase\b|text-transform:\s*uppercase/.test(source) || />\s*[A-Z]{2,}(?: [A-Z]{2,})+\s*</.test(source);
      })
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
