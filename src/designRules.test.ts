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
        return (
          /\buppercase\b|text-transform:\s*uppercase/.test(source) ||
          />\s*[A-Z]{2,}(?: [A-Z]{2,})+\s*</.test(source)
        );
      })
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  // Buttons are pills (visual-design §3.1): a squared control reads as a leftover style.
  it('gives no button or link a squared rounded-lg corner', () => {
    const control = /<(?:button|Link|a|motion\.button)\b(?:(?!<|\/>)[\s\S])*?\brounded-lg\b/;
    const offenders = sourceFiles(SRC)
      .filter((path) => path.endsWith('.tsx'))
      .filter((path) => !/^(pages[\\/]landing|components[\\/]welcome)/.test(relative(SRC, path)))
      .filter((path) => control.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  // The app sets its wordmark in the display face (visual-design §3.2); the serif brand
  // face belongs to the public landing and download pages only.
  it('keeps the serif brand face out of the app', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => path.endsWith('.tsx'))
      .filter((path) => !/^(pages[\\/]landing|components[\\/](welcome|landing))/.test(relative(SRC, path)))
      .filter((path) => /\bfont-brand\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  // One rule for labels above a control in Settings (fieldLabelClassName): they were
  // small grey regular in some sections and semibold ink in others.
  it('labels every Settings and course form field with the shared field label style', () => {
    const local = /<(?:label|legend)\b[^>]*className="[^"]*\btext-(?:sm|xs)\b[^"]*"[^>]*>\s*\n?\s*[A-Z][a-z]/;
    const offenders = sourceFiles(SRC)
      .filter((path) =>
        /^(pages[\\/](settings[\\/]|CourseSettings\.tsx)|components[\\/]course[\\/](AssessmentEditor|NewCourseForm|CourseStudyTarget)\.tsx)/.test(
          relative(SRC, path),
        ),
      )
      .filter((path) => local.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
