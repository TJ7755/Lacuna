const MAX_DIMENSION = 1280;
const QUALITY = 0.8;

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    }, 30000);
    img.onload = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function scaleToFit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  // Extreme aspect ratios must still leave a drawable pixel on the shorter edge.
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not process the image.'));
      },
      mimeType,
      QUALITY,
    );
  });
}

export interface CompressImageOptions {
  /** Longest-edge ceiling in pixels. Defaults to {@link MAX_DIMENSION} (1280), the
   *  ceiling every existing caller (card images) relies on. Image occlusion diagrams
   *  pass a higher ceiling (2560, see src/db/occlusionImage.ts) so small printed labels
   *  survive compression legibly (§6.10.4). */
  maxDimension?: number;
}

/**
 * Count the frames of a GIF by walking its blocks. A canvas draw only captures
 * the first frame, so multi-frame inputs must bypass the transcode below.
 */
function gifFrameCount(bytes: Uint8Array): number {
  if (bytes.length < 13) return 0;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return 0;
  // Logical Screen Descriptor: width(2) height(2) packed(1) bg(1) aspect(1).
  const packed = bytes[4 + 6];
  let offset = 13 + (packed & 0x80 ? 3 * 2 ** (packed & 0x07) : 0);
  let frames = 0;
  const skipSubBlocks = () => {
    while (offset < bytes.length && bytes[offset] !== 0) offset += 1 + bytes[offset];
    offset += 1;
  };
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 2;
      skipSubBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      if (frames > 1) return frames;
      const localPacked = bytes[offset + 9];
      offset += 10 + (localPacked & 0x80 ? 3 * 2 ** (localPacked & 0x07) : 0);
      offset += 1;
      skipSubBlocks();
    } else {
      return 0;
    }
  }
  return frames;
}

/** True when a WebP container carries the animation flag or animation chunks. */
function webpIsAnimated(bytes: Uint8Array): boolean {
  // RIFF....WEBP then chunks: a VP8X chunk advertises animation in its flags.
  if (bytes.length < 21) return false;
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (!riff.every((byte, index) => bytes[index] === byte)) return false;
  if (!webp.every((byte, index) => bytes[8 + index] === byte)) return false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const tag = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const size =
      bytes[offset + 4] |
      (bytes[offset + 5] << 8) |
      (bytes[offset + 6] << 16) |
      (bytes[offset + 7] << 24);
    // The VP8X flags advertise animation; ANIM/ANMF chunks carry it, so either
    // signal counts and scanning continues past an unflagged VP8X.
    if (tag === 'ANIM' || tag === 'ANMF') return true;
    if (tag === 'VP8X' && offset + 8 < bytes.length && (bytes[offset + 8] & 0x02) !== 0)
      return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

/**
 * True for multi-frame GIF/WebP inputs whose animation a canvas draw would
 * destroy. Unparseable input reads as static, preserving today's behaviour.
 */
async function imageIsAnimated(blob: Blob): Promise<boolean> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (blob.type === 'image/gif') return gifFrameCount(bytes) > 1;
    if (blob.type === 'image/webp') return webpIsAnimated(bytes);
    return false;
  } catch {
    return false;
  }
}

/** Compress an image blob using a canvas on the main thread. Animated GIF/WebP
 * inputs keep their original bytes: a canvas draw captures only the first
 * frame, so transcoding them would silently destroy the animation. */
export async function compressImageBlob(
  blob: Blob,
  options?: CompressImageOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  if ((blob.type === 'image/gif' || blob.type === 'image/webp') && (await imageIsAnimated(blob))) {
    const bitmap = await loadImageFromBlob(blob);
    return { blob, width: bitmap.width, height: bitmap.height };
  }
  const bitmap = await loadImageFromBlob(blob);
  const { width, height } = scaleToFit(
    bitmap.width,
    bitmap.height,
    options?.maxDimension ?? MAX_DIMENSION,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, 0, 0, width, height);

  // JPEG discards alpha; rasterised SVGs can have transparent backgrounds too.
  const preservesTransparency = ['image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(
    blob.type,
  );
  const mimeType = preservesTransparency ? 'image/png' : 'image/jpeg';
  const compressed = await canvasToBlob(canvas, mimeType);
  return { blob: compressed, width, height };
}
