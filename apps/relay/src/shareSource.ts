import type { BlobStore } from './store.js';
import { CHANNEL_TTL_MS } from './channelMaintenance.js';
import { isOfficialPublication } from './officialPublications.js';

export const SHARE_ID_RE = /^[0-9a-f]{32}$/;

/** Flatten classroom links to the publisher, never to another teacher's keys or mailbox. */
export async function courseSource(
  store: BlobStore,
  id: string,
  now: () => number,
): Promise<string | null> {
  const visited = new Set<string>();
  for (let hop = 0; hop < 8; hop += 1) {
    if (
      !SHARE_ID_RE.test(id) ||
      visited.has(id) ||
      !(await store.stat(`shares/${id}/auth`)) ||
      !(await shareLive(store, id, now))
    )
      return null;
    visited.add(id);
    const source = await store.get(`shares/${id}/source`);
    if (!source) return id;
    id = new TextDecoder().decode(source.body);
  }
  return null;
}

export async function shareLive(store: BlobStore, id: string, now: () => number): Promise<boolean> {
  if (await persistentPublicationExists(store, id)) return true;
  const [latest, source] = await Promise.all([
    lastShareWrite(store, id),
    store.get(`shares/${id}/source`),
  ]);
  if (latest !== null && now() - latest < CHANNEL_TTL_MS) return true;
  if (!source || !(await store.stat(`shares/${id}/auth`))) return false;
  const sourceId = new TextDecoder().decode(source.body);
  if (!SHARE_ID_RE.test(sourceId) || !(await store.stat(`shares/${sourceId}/auth`))) return false;
  if (await persistentPublicationExists(store, sourceId)) return true;
  // Mint flattens links to the publisher. Its updates also keep classroom links alive.
  const sourceLatest = await lastShareWrite(store, sourceId);
  return sourceLatest !== null && now() - sourceLatest < CHANNEL_TTL_MS;
}

async function persistentPublicationExists(store: BlobStore, id: string): Promise<boolean> {
  if (!isOfficialPublication(id)) return false;
  const [auth, payload] = await Promise.all([
    store.stat(`shares/${id}/auth`),
    store.stat(`shares/${id}/payload`),
  ]);
  return auth !== null && payload !== null;
}

async function lastShareWrite(store: BlobStore, id: string): Promise<number | null> {
  const objects = await Promise.all(
    ['auth', 'payload', 'meta', 'teacher', 'source', 'class-code'].map((name) =>
      store.stat(`shares/${id}/${name}`),
    ),
  );
  const stamps = objects.flatMap((stored) => (stored ? [stored.uploadedAt] : []));
  return stamps.length ? Math.max(...stamps) : null;
}
