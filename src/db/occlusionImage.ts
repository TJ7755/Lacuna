// Diagram upload for image occlusion (§6.10.4). Occlusion diagrams get their own,
// higher compression ceiling than ordinary card images — 2560px longest edge rather
// than compressImage.ts's 1280px default — so small printed labels on a diagram
// survive compression legibly. Otherwise identical to the ordinary image path
// (src/components/markdown/image.ts): compress, then store as a MediaAsset.

import { compressImageBlob } from '../utils/compressImage';
import { storeImageBlob } from './assets';
import type { MediaAsset } from './types';

export const OCCLUSION_MAX_DIMENSION = 2560;

/** Compress an occlusion diagram file and store it as an image asset. */
export async function storeOcclusionDiagram(file: Blob, mimeType = file.type): Promise<MediaAsset> {
  const { blob, width, height } = await compressImageBlob(file, { maxDimension: OCCLUSION_MAX_DIMENSION });
  return storeImageBlob(blob, blob.type || mimeType, width, height);
}
