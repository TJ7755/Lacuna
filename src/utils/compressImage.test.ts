import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImageBlob } from './compressImage';

// A minimal Image stand-in whose "decoded" dimensions are set per test, and which
// resolves asynchronously like a real image load, without ever touching the network.
class FakeImage {
  static nextWidth = 0;
  static nextHeight = 0;
  width = FakeImage.nextWidth;
  height = FakeImage.nextHeight;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function setSourceDimensions(width: number, height: number) {
  FakeImage.nextWidth = width;
  FakeImage.nextHeight = height;
}

describe('compressImageBlob', () => {
  let canvasDims: { width: number; height: number } | null;

  beforeEach(() => {
    canvasDims = null;
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:src');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      canvasDims = { width: this.width, height: this.height };
      callback(new Blob(['x'], { type: 'image/jpeg' }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales to the default 1280px ceiling when no option is given (every existing caller)', async () => {
    setSourceDimensions(4000, 2000);
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }));
    expect(result.width).toBe(1280);
    expect(result.height).toBe(640);
    expect(canvasDims).toEqual({ width: 1280, height: 640 });
  });

  it('honours a custom maxDimension, e.g. the 2560px occlusion ceiling', async () => {
    setSourceDimensions(4000, 2000);
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }), { maxDimension: 2560 });
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1280);
  });

  it('leaves images already under the ceiling unscaled', async () => {
    setSourceDimensions(800, 600);
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }));
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });
});
