import initSqlite from '@sqlite.org/sqlite-wasm';
import { strFromU8, unzipSync } from 'fflate';

export interface ApkgDeck {
  id: string;
  name: string;
  path: string;
}

export interface ApkgNote {
  noteId: string;
  deckId: string;
  cardType: 'basic' | 'cloze';
  convertedFrom: string | null;
  modelName: string;
  front: string;
  back: string;
  clozeText: string | null;
  tags: string[];
}

type SqlValue = string | number | bigint | null;

function toStringValue(value: SqlValue): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function toNumberValue(value: SqlValue): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

function splitTags(raw: string): string[] {
  return raw
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMediaReferences(
  content: string,
  media: Record<string, string>,
): string {
  let next = content;
  for (const [filename, uri] of Object.entries(media)) {
    const escapedName = escapeRegExp(filename);
    const srcRegex = new RegExp(`src=("|')${escapedName}("|')`, 'gi');
    next = next.replace(
      srcRegex,
      (_match, quoteA, quoteB) => `src=${quoteA}${uri}${quoteB}`,
    );
  }
  return next;
}

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';

  return 'application/octet-stream';
}

function toDataUri(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export async function parseApkg(file: File): Promise<{
  decks: ApkgDeck[];
  notes: ApkgNote[];
  media: Record<string, string>;
}> {
  const zipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entryNames = Object.keys(zipped);

  const dbEntryName =
    entryNames.find((name) => name.endsWith('collection.anki21')) ??
    entryNames.find((name) => name.endsWith('collection.anki2'));

  if (!dbEntryName) {
    throw new Error(
      'The .apkg file does not contain collection.anki21 or collection.anki2.',
    );
  }

  const mediaEntryName = entryNames.find((name) => name.endsWith('media'));
  const mediaMapRaw = mediaEntryName
    ? JSON.parse(strFromU8(zipped[mediaEntryName]))
    : {};

  const media: Record<string, string> = {};
  for (const [key, filename] of Object.entries(
    mediaMapRaw as Record<string, string>,
  )) {
    const mediaBytes = zipped[key];
    if (!mediaBytes || typeof filename !== 'string') {
      continue;
    }
    media[filename] = toDataUri(mediaBytes, inferMimeType(filename));
  }

  const sqlite3 = await initSqlite();
  const dbFilename = `/tmp-${crypto.randomUUID()}.sqlite`;
  sqlite3.capi.sqlite3_js_posix_create_file(dbFilename, zipped[dbEntryName]);

  const db = new sqlite3.oo1.DB(dbFilename, 'r');

  try {
    const colRows = db.selectObjects('SELECT decks, models FROM col LIMIT 1');
    const col = colRows[0] ?? {};

    const deckJsonRaw = typeof col.decks === 'string' ? col.decks : '{}';
    const modelJsonRaw = typeof col.models === 'string' ? col.models : '{}';

    const deckJson = JSON.parse(deckJsonRaw) as Record<
      string,
      { id?: number; name?: string }
    >;

    const modelJson = JSON.parse(modelJsonRaw) as Record<
      string,
      { type?: number; name?: string; flds?: Array<{ name?: string }> }
    >;

    const decks: ApkgDeck[] = Object.entries(deckJson)
      .map(([id, deck]) => {
        const path = (deck.name ?? '').trim();
        return {
          id,
          name: path.split('::').at(-1) ?? path,
          path,
        };
      })
      .filter((deck) => deck.path.length > 0)
      .sort((a, b) => a.path.localeCompare(b.path));

    const cards = db.selectObjects('SELECT nid, did FROM cards');
    const noteDeckMap = new Map<string, string>();
    for (const card of cards) {
      const nid = toStringValue((card.nid as SqlValue) ?? '');
      const did = toStringValue((card.did as SqlValue) ?? '');
      if (!nid || !did || noteDeckMap.has(nid)) continue;
      noteDeckMap.set(nid, did);
    }

    const rawNotes = db.selectObjects('SELECT id, mid, tags, flds FROM notes');
    const notes: ApkgNote[] = [];

    for (const note of rawNotes) {
      const noteId = toStringValue((note.id as SqlValue) ?? '');
      const mid = toNumberValue((note.mid as SqlValue) ?? 0);
      const tags = splitTags(toStringValue((note.tags as SqlValue) ?? ''));
      const fldsRaw = toStringValue((note.flds as SqlValue) ?? '');

      const fields = fldsRaw
        .split('\u001f')
        .map((field) => replaceMediaReferences(field, media));

      const deckId = noteDeckMap.get(noteId);
      if (!deckId) {
        continue;
      }

      const model = modelJson[String(mid)] ?? {};
      const modelName = (model.name ?? '').trim();
      const lowerModelName = modelName.toLowerCase();
      const isCloze =
        model.type === 1 ||
        lowerModelName.includes('cloze') ||
        /\{\{c\d+::/i.test(fields[0] ?? '');
      const isBasic = lowerModelName.includes('basic');

      if (isCloze) {
        notes.push({
          noteId,
          deckId,
          cardType: 'cloze',
          convertedFrom: null,
          modelName,
          front: '',
          back: '',
          clozeText: fields[0] ?? '',
          tags,
        });
        continue;
      }

      notes.push({
        noteId,
        deckId,
        cardType: 'basic',
        convertedFrom: isBasic ? null : modelName || 'unknown model',
        modelName,
        front: fields[0] ?? '',
        back: fields[1] ?? '',
        clozeText: null,
        tags,
      });
    }

    return {
      decks,
      notes,
      media,
    };
  } finally {
    db.close();
  }
}
