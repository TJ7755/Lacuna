import { readSyncState, updateSyncState } from '../db/mutationStamp';
import type { RememberedShareLinkCredentials } from '../db/types';
import { SHARE_ID_RE } from './client';

const WRITE_TOKEN_RE = /^[0-9a-f]{64}$/;

/** Teacher credentials for one share link, or null when this device cannot republish it. */
export async function readShareCredentials(
  shareId: string,
): Promise<RememberedShareLinkCredentials | null> {
  if (!SHARE_ID_RE.test(shareId)) return null;
  const state = await readSyncState();
  const entry = state?.shareLinks?.[shareId];
  if (!entry || !WRITE_TOKEN_RE.test(entry.writeToken) || typeof entry.relayUrl !== 'string') {
    return null;
  }
  return entry;
}

/** Remember teacher credentials after minting or publishing a share link. */
export async function writeShareCredentials(
  shareId: string,
  credentials: RememberedShareLinkCredentials,
): Promise<void> {
  if (!SHARE_ID_RE.test(shareId)) throw new Error('The share link code is invalid.');
  if (!WRITE_TOKEN_RE.test(credentials.writeToken)) {
    throw new Error('The share link write token is invalid.');
  }
  await updateSyncState((current) => ({
    ...current,
    shareLinks: { ...current?.shareLinks, [shareId]: credentials },
  }));
}

/** Forget a share link's write credentials, e.g. after unpublishing it. */
export async function forgetShareCredentials(shareId: string): Promise<void> {
  await updateSyncState((current) => {
    if (!current?.shareLinks?.[shareId]) return undefined;
    const { [shareId]: _omitted, ...rest } = current.shareLinks;
    return { ...current, shareLinks: rest };
  });
}
