import { useEffect, useRef } from 'react';

const MAX_PREVIEW_EDGE = 320;

/**
 * Draws a chosen image file onto a canvas. No object URL reaches the document, so the
 * preview cannot be mistaken for markup by the browser or by code scanning.
 */
export function ImageFilePreview({ file, className }: { file: File; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (typeof createImageBitmap !== 'function') return;
    let cancelled = false;
    createImageBitmap(file).then(
      (bitmap) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!cancelled && canvas && context) {
          const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height));
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
        bitmap.close();
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [file]);
  return (
    <canvas ref={canvasRef} className={className} role="img" aria-label="Selected image preview" />
  );
}
