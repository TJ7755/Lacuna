import { db } from './database';
import type { MediaAsset } from '@lacuna/core/db/types';
import { extractMarkdownAssets as extract } from './markdownAssetExtraction';

export async function extractMarkdownAssets(
  markdown: string,
  putAsset: (asset: MediaAsset) => Promise<unknown>,
  knownHashes?: Set<string>,
): Promise<string> {
  return extract(markdown, putAsset, (hash) => db.assets.get(hash), knownHashes);
}
