import type { BlobStore } from './store.js';

export const CHANNEL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const CHANNEL_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

const PAGE_SIZE = 100;
const CURSOR_KEY = 'maintenance/channel-cursor';
const CHANNEL_KEY_RE = /^c\/([0-9a-f]{32})\/(?:meta|state|keybag)$/;

export interface ChannelCleanupResult {
  channelsDeleted: number;
  channelObjectsDeleted: number;
}

export async function cleanupExpiredChannels(
  store: BlobStore,
  now: number,
): Promise<ChannelCleanupResult> {
  const storedCursor = await store.get(CURSOR_KEY);
  const cursor = storedCursor ? new TextDecoder().decode(storedCursor.body) : undefined;
  const page = await store.listPage('c/', cursor, PAGE_SIZE);
  const ids = new Set<string>();
  for (const object of page.objects) {
    const id = CHANNEL_KEY_RE.exec(object.key)?.[1];
    if (id) ids.add(id);
  }

  let channelsDeleted = 0;
  let channelObjectsDeleted = 0;
  for (const id of ids) {
    const prefix = `c/${id}/`;
    const objects = await store.list(prefix);
    if (objects.length === 0) continue;
    const current = await Promise.all(objects.map((object) => store.get(object.key)));
    const latest = Math.max(...current.map((object) => object?.uploadedAt ?? 0));
    if (now - latest < CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS) continue;

    // A fresh slot may appear after the group listing. Re-read the known keys
    // before deleting; the extra grace exceeds the relay function's maximum
    // lifetime, so an authorised write from before expiry cannot still run.
    const fresh = await Promise.all(
      ['meta', 'state', 'keybag'].map((name) => store.get(`${prefix}${name}`)),
    );
    if (
      fresh.some(
        (object) => object && now - object.uploadedAt < CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS,
      )
    ) {
      continue;
    }
    await store.del(objects.map((object) => object.key));
    channelsDeleted += 1;
    channelObjectsDeleted += objects.length;
  }

  if (page.cursor) {
    await store.put(CURSOR_KEY, new TextEncoder().encode(page.cursor), { overwrite: true });
  } else if (storedCursor) {
    await store.del([CURSOR_KEY]);
  }

  return { channelsDeleted, channelObjectsDeleted };
}
