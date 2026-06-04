// Image handling: downscale and re-encode uploaded/dropped images, then store the Blob
// in IndexedDB's asset table so card rows only carry a small stable reference.

import { assetUrl, storeImageBlob } from '../../db/assets';

const MAX_DIMENSION = 1280;
const QUALITY = 0.8;

/**
 * Store an image File as a compressed Blob asset. The image is scaled so its longest
 * edge is at most 1280px and re-encoded as JPEG (or PNG when transparency is likely
 * needed) at ~0.8 quality.
 */
export async function imageFileToAssetUrl(file: File): Promise<string> {
  const bitmap = await loadImage(file);
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, 0, 0, width, height);

  // PNGs may rely on transparency; everything else compresses well as JPEG.
  const isPng = file.type === 'image/png';
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, mimeType);
  const asset = await storeImageBlob(blob, mimeType, width, height);
  return assetUrl(asset.hash);
}

function scaleToFit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
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

/** Build the Markdown for an embedded image. */
export function imageMarkdown(url: string, alt = 'image'): string {
  return `![${alt}](${url})`;
}
