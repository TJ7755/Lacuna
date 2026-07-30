import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(async (blob: Blob) => ({ blob, width: 100, height: 80 })),
}));
vi.mock('./assets', () => ({
  storeImageBlob: vi.fn(async (blob: Blob, mimeType: string, width: number, height: number) => ({
    hash: 'diagram-hash',
    blob,
    mimeType,
    kind: 'image',
    width,
    height,
    createdAt: 0,
  })),
}));

import { compressImageBlob } from '../utils/compressImage';
import { storeImageBlob } from './assets';
import { OCCLUSION_MAX_DIMENSION, storeOcclusionDiagram } from './occlusionImage';

describe('storeOcclusionDiagram', () => {
  it('requests the 2560px occlusion ceiling rather than the ordinary card-image default', async () => {
    expect(OCCLUSION_MAX_DIMENSION).toBe(2560);
    const file = new Blob(['x'], { type: 'image/png' });

    await storeOcclusionDiagram(file);

    expect(compressImageBlob).toHaveBeenCalledWith(file, { maxDimension: 2560 });
  });

  it('stores the compressed blob with its resolved dimensions', async () => {
    const file = new Blob(['x'], { type: 'image/png' });

    const asset = await storeOcclusionDiagram(file);

    expect(storeImageBlob).toHaveBeenCalledWith(expect.anything(), 'image/png', 100, 80);
    expect(asset.hash).toBe('diagram-hash');
  });
});
