/**
 * OcclusionCardFront — shows the image with all occlusion regions hidden.
 *
 * The active region is coloured with --colour-accent; all other regions are
 * rendered in a neutral dark colour. Labels are not shown on the front face.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { OcclusionData } from '../../types';
import styles from './OcclusionCard.module.css';

interface OcclusionCardFrontProps {
  imageUrl: string;
  occlusionData: OcclusionData;
  activeRectId: string;
  className?: string;
}

export function OcclusionCardFront({
  imageUrl,
  occlusionData,
  activeRectId,
  className,
}: OcclusionCardFrontProps) {
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
      ctx.fillStyle = rect.id === activeRectId ? accentColor : neutralColor;
      ctx.fillRect(px, py, pw, ph);
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
