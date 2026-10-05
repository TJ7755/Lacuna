import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('database layer boundary', () => {
  it('never imports the UI layer', () => {
    const offenders = sourceFiles('src/db').filter((file) =>
      /from\s+['"](\.\.\/)+(components|pages)\//.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
