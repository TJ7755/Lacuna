import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { parseApkgBuffer } from './apkgParser';

const require = createRequire(import.meta.url);

describe('Anki SQLite parsing', () => {
  it('extracts standard and cloze cards, scheduling history and media without application storage', async () => {
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))).buffer,
    });
    const collection = new SQL.Database();
    let archive: Uint8Array;
    try {
      collection.run(`
        CREATE TABLE notetypes (id, name, type, flds, tmpl);
        CREATE TABLE decks (id, name);
        CREATE TABLE notes (id, mid, flds, tags, sfld);
        CREATE TABLE cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags);
        CREATE TABLE revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type);
        INSERT INTO notetypes VALUES (1, 'Basic', 0, '[]', '[]'), (2, 'Cloze', 1, '[]', '[]');
        INSERT INTO decks VALUES (1, 'Biology');
        INSERT INTO cards VALUES
          (100, 10, 1, 0, 2, 0, 1, 12, 2500, 3, 1, 0, 0, 0, 0),
          (200, 20, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        INSERT INTO revlog VALUES (1700000000000, 100, 0, 3, 12, 8, 2500, 4000, 1);
      `);
      collection.run('INSERT INTO notes VALUES (?, ?, ?, ?, ?)', [
        10,
        1,
        '<b>Cell</b>\x1fLife &amp;quot; &amp;#39; &quot; &#39; &amp; &lt; &gt; &nbsp;',
        ' biology ',
        'Cell',
      ]);
      collection.run('INSERT INTO notes VALUES (?, ?, ?, ?, ?)', [
        20,
        2,
        '{{c1::Nucleus}}',
        '',
        'Nucleus',
      ]);
      archive = zipSync({
        'collection.anki2': collection.export(),
        media: strToU8('{"0":"diagram.png"}'),
        '0': new Uint8Array([1, 2, 3]),
      });
    } finally {
      collection.close();
    }
    const parsed = await parseApkgBuffer(archive.buffer as ArrayBuffer);
    expect(parsed).toMatchObject({ deckName: 'Biology', skippedNotes: 0, skippedCards: 0 });
    expect(parsed.cards).toHaveLength(2);
    expect(parsed.cards[0]).toMatchObject({
      type: 'front_back',
      front: '**Cell**',
      back: 'Life &quot; &#39; " \' & < >',
      stability: 12,
      tags: ['biology'],
      history: [
        expect.objectContaining({ timestamp: 1700000000000, grade: 3, responseTimeSec: 4 }),
      ],
    });
    expect(parsed.cards[1]).toMatchObject({
      type: 'cloze',
      front: '{{c1::Nucleus}}',
      state: 0,
      history: [],
    });
    expect(parsed.cards[0].id).not.toBe(parsed.cards[1].id);
    expect(parsed.media.get('diagram.png')).toEqual(new Uint8Array([1, 2, 3]));
    const fresh = await parseApkgBuffer(archive.buffer as ArrayBuffer, { importScheduling: false });
    expect(fresh.cards.every((card) => card.history.length === 0)).toBe(true);
  });
});
