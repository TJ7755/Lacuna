import { expect, it } from 'vitest';
import { collectOfflineImportRoute } from './app-shell-precache';

it('precaches the actual Import panel when a catalogue helper has the same chunk basename', () => {
  expect(
    collectOfflineImportRoute([
      {
        fileName: 'assets/app-ENTRY001.js',
        isEntry: true,
        imports: [],
        moduleIds: ['/src/main.tsx'],
      },
      {
        fileName: 'assets/ImportPanel-CATALOG1.js',
        isEntry: false,
        imports: [],
        moduleIds: ['/src/library/catalogue.ts'],
      },
      {
        fileName: 'assets/ImportPanel-IMPORT01.js',
        isEntry: false,
        imports: ['assets/ImportPanel-CATALOG1.js'],
        moduleIds: ['/src/components/import/ImportPanel.tsx'],
        viteMetadata: { importedCss: new Set(['assets/ImportPanel-IMPORT01.css']) },
      },
    ]),
  ).toEqual([
    'assets/ImportPanel-IMPORT01.js',
    'assets/ImportPanel-CATALOG1.js',
    'assets/ImportPanel-IMPORT01.css',
  ]);
});
