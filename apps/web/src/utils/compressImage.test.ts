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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      mimeType?: string,
    ) {
      canvasDims = { width: this.width, height: this.height };
      callback(new Blob(['x'], { type: mimeType }));
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
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }), {
      maxDimension: 2560,
    });
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1280);
  });

  it('leaves images already under the ceiling unscaled', async () => {
    setSourceDimensions(800, 600);
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }));
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it.each(['image/png', 'image/webp', 'image/gif', 'image/svg+xml'])(
    'uses a transparency-preserving encoding for static %s uploads',
    async (mimeType) => {
      setSourceDimensions(800, 600);
      const result = await compressImageBlob(new Blob(['x'], { type: mimeType }));
      expect(result.blob.type).toBe('image/png');
    },
  );

  it.each([
    // ImageMagick output, then the same image with the global palette moved into frame one.
    [
      'global',
      'R0lGODlhAQABAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAAACAkQBACH5BAAKAAAALAAAAAABAAEAgAAA/wAAAAICRAEAOw==',
    ],
    [
      'local',
      'R0lGODlhAQABAHAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAID/AAAAAAACAkQBACH5BAAKAAAALAAAAAABAAEAgAAA/wAAAAICRAEAOw==',
    ],
  ])('keeps an animated GIF with a %s palette on its first frame', async (_palette, encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0));
    setSourceDimensions(1, 1);
    const input = new Blob([bytes], { type: 'image/gif' });
    const result = await compressImageBlob(input);
    expect(result.blob).toBe(input);
    expect(result).toMatchObject({ width: 1, height: 1 });
  });

  it('still flattens a single-frame GIF to PNG', async () => {
    const bytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ]);
    setSourceDimensions(1, 1);
    const result = await compressImageBlob(
      new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' }),
    );
    expect(result.blob.type).toBe('image/png');
  });

  it('keeps an animated WebP in its original bytes instead of flattening it', async () => {
    // A two-frame image encoded by ImageMagick.
    const bytes = Uint8Array.from(
      atob(
        'UklGRsAAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAAEAAAEAAGQAAAJWUDggMAAAANABAJ0BKgIAAgACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTUZEAAAAAAAAAAAAAQAAAQAAZAAAAFZQOCAsAAAAlAEAnQEqAgACAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=',
      ),
      (byte) => byte.charCodeAt(0),
    );
    setSourceDimensions(2, 2);
    const input = new Blob([bytes], { type: 'image/webp' });
    const result = await compressImageBlob(input);
    expect(result.blob).toBe(input);
  });

  it('still flattens a still WebP to PNG', async () => {
    // RIFF WEBP with a plain lossy VP8 chunk: no animation signal.
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
      0x20, 0x04, 0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01,
    ]);
    setSourceDimensions(800, 600);
    const result = await compressImageBlob(
      new Blob([bytes.buffer as ArrayBuffer], { type: 'image/webp' }),
    );
    expect(result.blob.type).toBe('image/png');
  });

  it('retains JPEG compression for opaque JPEG uploads', async () => {
    setSourceDimensions(800, 600);
    const result = await compressImageBlob(new Blob(['x'], { type: 'image/jpeg' }));
    expect(result.blob.type).toBe('image/jpeg');
  });

  it.each([
    { width: 6000, height: 1, maxDimension: undefined, expectedWidth: 1280, expectedHeight: 1 },
    { width: 1, height: 6000, maxDimension: undefined, expectedWidth: 1, expectedHeight: 1280 },
    { width: 6000, height: 1, maxDimension: 2560, expectedWidth: 2560, expectedHeight: 1 },
    { width: 1, height: 6000, maxDimension: 2560, expectedWidth: 1, expectedHeight: 2560 },
  ])(
    'keeps both dimensions positive when resizing $width × $height to $maxDimension',
    async ({ width, height, maxDimension, expectedWidth, expectedHeight }) => {
      setSourceDimensions(width, height);
      const result = await compressImageBlob(new Blob(['x'], { type: 'image/png' }), {
        maxDimension,
      });
      expect(result.width).toBe(expectedWidth);
      expect(result.height).toBe(expectedHeight);
      expect(canvasDims).toEqual({ width: expectedWidth, height: expectedHeight });
    },
  );
});
