/**
 * OcclusionCardBack — shows the image with the active region revealed.
 *
 * Non-active regions remain fully opaque (as on the front). The active region
 * is rendered with a semi-transparent accent fill and its label shown inside.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { OcclusionData } from '../../types';
import styles from './OcclusionCard.module.css';

interface OcclusionCardBackProps {
  imageUrl: string;
  occlusionData: OcclusionData;
  activeRectId: string;
  className?: string;
}

export function OcclusionCardBack({
  imageUrl,
  occlusionData,
  activeRectId,
  className,
}: OcclusionCardBackProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const accentColor =
      getComputedStyle(canvas).getPropertyValue('--colour-accent').trim() ||
      '#0066cc';
    const neutralColor = '#1e293b';

    for (const rect of occlusionData) {
      const px = rect.x * cw;
      const py = rect.y * ch;
      const pw = rect.width * cw;
      const ph = rect.height * ch;

      if (rect.id === activeRectId) {
        // Revealed region — semi-transparent accent fill + border + label
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = accentColor;
        ctx.fillRect(px, py, pw, ph);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

        if (rect.label) {
          const pad = 6;
          ctx.font = 'bold 16px system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          const cx = px + pw / 2;
          const cy = py + ph / 2;
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 4;
          ctx.fillText(rect.label, cx, cy, pw - pad * 2);
          ctx.shadowBlur = 0;
          ctx.textAlign = 'left';
        }
      } else {
        ctx.fillStyle = neutralColor;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }, [occlusionData, activeRectId]);

  const syncAndDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (w > 0 && h > 0) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    }
  }, [redraw]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const observer = new ResizeObserver(syncAndDraw);
    observer.observe(img);
    img.addEventListener('load', syncAndDraw);
    syncAndDraw();
    return () => {
      observer.disconnect();
      img.removeEventListener('load', syncAndDraw);
    };
  }, [imageUrl, syncAndDraw]);

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        className={styles.image}
        draggable={false}
      />
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
