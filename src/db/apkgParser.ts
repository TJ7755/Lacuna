// ZIP and SQLite parsing only; safe to load in a worker without application storage.
import { unzipSync, type Unzipped } from 'fflate';
import initSqlJs, { type Database } from 'sql.js';
import { assertZipMetadataWithinLimits } from './zipMetadata';
import sqlWasmUrl from '../assets/sql-wasm.wasm?url';
import {
  assertApkgSize,
  MAX_APKG_FILE_COUNT,
  MAX_APKG_UNCOMPRESSED_BYTES,
  type ApkgCardDraft,
  type ApkgImportResult,
  type ApkgParseOptions,
} from './apkgTypes';
import {
  mapModelToLacuna,
  buildLacunaCard,
  type AnkiNote,
  type AnkiCard,
  type AnkiRevlog,
  type AnkiModel,
} from './apkgMapping';

interface AnkiDeck {
  id: number;
  name: string;
}

/** Worker entry point. Kept separate from the import launcher so ZIP and SQLite
 * processing never runs on the UI thread in browsers. */
export async function parseApkgBuffer(
  buffer: ArrayBuffer,
  options: ApkgParseOptions = {},
  wasmUrl = sqlWasmUrl,
): Promise<ApkgImportResult> {
  assertApkgSize(buffer.byteLength);
  assertZipMetadataWithinLimits(buffer, {
    maxEntries: MAX_APKG_FILE_COUNT,
    maxUncompressedBytes: MAX_APKG_UNCOMPRESSED_BYTES,
  });
  const zip = unzipSync(new Uint8Array(buffer));
  const fileCount = Object.keys(zip).length;
  if (fileCount > MAX_APKG_FILE_COUNT) {
    throw new Error(`APKG contains too many files: ${fileCount} (max ${MAX_APKG_FILE_COUNT})`);
  }
  let totalUncompressed = 0;
  for (const bytes of Object.values(zip)) {
    totalUncompressed += bytes.byteLength;
    if (totalUncompressed > MAX_APKG_UNCOMPRESSED_BYTES) {
      throw new Error(`APKG uncompressed size too large: ${totalUncompressed} bytes (max 100 MB)`);
    }
  }

  // Read media mapping JSON.
  const mediaMap = readMediaMap(zip);

  // Load SQLite database.
  const db = await loadAnkiDatabase(zip, wasmUrl);

  try {
    return extractFromDatabase(db, zip, mediaMap, options);
  } finally {
    db.close();
  }
}

/** Read the media JSON file from the ZIP. */
function readMediaMap(zip: Unzipped): Map<string, string> {
  const mediaJson = zip['media'];
  if (!mediaJson) return new Map();
  try {
    const parsed = JSON.parse(new TextDecoder().decode(mediaJson)) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

/** Load sql.js and open the collection.anki2 database. */
async function loadAnkiDatabase(zip: Unzipped, wasmUrl: string): Promise<Database> {
  const dbBytes = zip['collection.anki2'];
  if (!dbBytes) {
    throw new Error(
      'This file does not contain a valid Anki collection (collection.anki2 missing).',
    );
  }

  const SQL = await initSqlJs({
    locateFile: (file) => {
      // sql.js WASM must be served from public/ or CDN.
      if (file.endsWith('.wasm')) {
        return wasmUrl;
      }
      return file;
    },
  });

  return new SQL.Database(dbBytes);
}

// ---------------------------------------------------------------------------
// Database extraction
// ---------------------------------------------------------------------------

function extractFromDatabase(
  db: Database,
  zip: Unzipped,
  mediaMap: Map<string, string>,
  options: ApkgParseOptions,
): ApkgImportResult {
  // Read models.
  const models = readModels(db);
  const modelMap = new Map(models.map((m) => [m.id, m]));

  // Read Anki decks.
  const ankiDecks = readDecks(db);
  const firstDeck = ankiDecks[0];
  const deckName = options.deckName ?? firstDeck?.name ?? 'Imported from Anki';

  // Read notes.
  const notes = readNotes(db);

  // Read cards.
  const cards = readCards(db);
  const cardByNid = groupBy(cards, (c) => c.nid);

  // Read revlog.
  const revlogs = options.importScheduling !== false ? readRevlog(db) : [];
  const revlogByCid = groupBy(revlogs, (r) => r.cid);

  // Build Lacuna cards.
  const lacunaCards: ApkgCardDraft[] = [];
  let skippedNotes = 0;
  let skippedCards = 0;

  for (const note of notes) {
    const model = modelMap.get(note.mid);
    if (!model) {
      skippedNotes++;
      continue;
    }

    const mapping = mapModelToLacuna(model, note);
    if (!mapping) {
      skippedNotes++;
      continue;
    }

    const ankiCards = cardByNid.get(note.id) ?? [];
    if (ankiCards.length === 0) {
      skippedNotes++;
      continue;
    }

    for (const ankiCard of ankiCards) {
      const card = buildLacunaCard(ankiCard, mapping, revlogByCid.get(ankiCard.id) ?? []);
      if (card) {
        lacunaCards.push(card);
      } else {
        skippedCards++;
      }
    }
  }

  // Extract media blobs.
  const media = new Map<string, Uint8Array>();
  for (const [key, filename] of mediaMap.entries()) {
    const bytes = zip[key];
    if (bytes) {
      media.set(filename, bytes);
    }
  }

  return {
    deckName,
    cards: lacunaCards,
    media,
    skippedNotes,
    skippedCards,
  };
}

// ---------------------------------------------------------------------------
// SQLite readers
// ---------------------------------------------------------------------------

function readModels(db: Database): AnkiModel[] {
  const stmt = db.prepare('SELECT id, name, type, flds, tmpl FROM notetypes');
  const models: AnkiModel[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      name: string;
      type: number;
      flds: string;
      tmpl: string;
    };
    try {
      models.push({
        id: row.id,
        name: row.name,
        type: row.type,
        flds: JSON.parse(row.flds) as { name: string }[],
        tmpl: JSON.parse(row.tmpl) as { name: string; qfmt: string; afmt: string }[],
      });
    } catch {
      // Skip malformed models.
    }
  }
  stmt.free();
  return models;
}

function readNotes(db: Database): AnkiNote[] {
  const stmt = db.prepare('SELECT id, mid, flds, tags, sfld FROM notes');
  const notes: AnkiNote[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      mid: number;
      flds: string;
      tags: string;
      sfld: string;
    };
    notes.push({
      id: row.id,
      mid: row.mid,
      flds: row.flds,
      tags: row.tags,
      sfld: row.sfld,
    });
  }
  stmt.free();
  return notes;
}

function readCards(db: Database): AnkiCard[] {
  const stmt = db.prepare(
    'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags FROM cards',
  );
  const cards: AnkiCard[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, number>;
    cards.push({
      id: row.id,
      nid: row.nid,
      did: row.did,
      ord: row.ord,
      type: row.type,
      queue: row.queue,
      due: row.due,
      ivl: row.ivl,
      factor: row.factor,
      reps: row.reps,
      lapses: row.lapses,
      left: row.left,
      odue: row.odue,
      odid: row.odid,
      flags: row.flags,
    });
  }
  stmt.free();
  return cards;
}

function readRevlog(db: Database): AnkiRevlog[] {
  const stmt = db.prepare(
    'SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog',
  );
  const logs: AnkiRevlog[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, number>;
    logs.push({
      id: row.id,
      cid: row.cid,
      usn: row.usn,
      ease: row.ease,
      ivl: row.ivl,
      lastIvl: row.lastIvl,
      factor: row.factor,
      time: row.time,
      type: row.type,
    });
  }
  stmt.free();
  return logs;
}

function readDecks(db: Database): AnkiDeck[] {
  const stmt = db.prepare('SELECT id, name FROM decks');
  const decks: AnkiDeck[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: number; name: string };
    decks.push({ id: row.id, name: row.name });
  }
  stmt.free();
  return decks;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
