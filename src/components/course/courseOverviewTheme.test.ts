import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = [
  [
    'course-overview.css',
    readFileSync(new URL('./' + 'course-overview.css', import.meta.url), 'utf8'),
  ],
];

describe('course overview theme inheritance', () => {
  it.each(styles)('%s uses the application palette for every colour', (_, css) => {
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '').split(/[;{}]/);
    const colours = declarations.filter((line) =>
      /^\s*(?:--course-[\w-]+|color|background|background-image|border(?:-color|-top|-bottom|-left|-right)?|outline|stroke|fill|box-shadow)\s*:/.test(
        line,
      ),
    );
    expect(colours.length).toBeGreaterThan(0);
    for (const declaration of colours) {
      expect(declaration, 'A fixed colour bypasses Settings').not.toMatch(
        /#[\da-f]{3,8}\b|\b(?:white|black)\b|(?:rgb|hsl)a?\(\s*\d/i,
      );
      if (!/(?:\b(?:none|transparent|inherit)|:\s*0)\s*$/.test(declaration)) {
        expect(declaration, 'Colours must inherit existing theme tokens').toMatch(
          /var\(--(?:paper|surface(?:-raised)?|ink(?:-soft|-faint)?|line(?:-strong)?|accent(?:-soft|-ink|-fg)?)\)/,
        );
      }
    }
  });
});
