import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeOcclusionDiagram } from './occlusionImage';
import { db } from './schema';

// Only browser decoding and encoding are substituted; compression and persistence stay real.
class DecodedImage {
  width = 4000;
  height = 2000;
  onload: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('storeOcclusionDiagram', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.stubGlobal('Image', DecodedImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      mimeType?: string,
    ) {
      callback(new Blob([`${this.width}x${this.height}`], { type: mimeType }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('persists a diagram at the 2560px ceiling with its encoded bytes and dimensions', async () => {
    const file = new Blob(['source'], { type: 'image/png' });

    const asset = await storeOcclusionDiagram(file);

    expect(await db.assets.get(asset.hash)).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
      width: 2560,
      height: 1280,
      blob: new TextEncoder().encode('2560x1280'),
    });
  });
});
