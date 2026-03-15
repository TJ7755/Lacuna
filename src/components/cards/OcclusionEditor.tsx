/**
 * OcclusionEditor — image upload and rectangle drawing for image occlusion cards.
 *
 * The user uploads an image, then draws labelled rectangles to define occlusion
 * regions. Each region will become a separate review item.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { OcclusionData, OcclusionRect } from '../../types';
import { UI } from '../../ui-strings';
import styles from './OcclusionEditor.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MIN_FRACTION = 0.02; // minimum side length as fraction of image dimension
const HANDLE_SIZE = 8; // px — rendered size of corner handles

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'draw' | 'select';

interface PendingLabel {
  x: number; // fraction
  y: number;
  width: number;
  height: number;
  /** Pixel position for the inline input (relative to canvas container). */
  inputLeft: number;
  inputTop: number;
}

interface DrawDrag {
  startX: number; // CSS px on canvas
  startY: number;
  currentX: number;
  currentY: number;
}

interface ResizeDrag {
  rectId: string;
  handle: 'nw' | 'ne' | 'sw' | 'se';
  origRect: OcclusionRect;
  origMouseX: number;
  origMouseY: number;
}

interface MoveDrag {
  rectId: string;
  origRect: OcclusionRect;
  origMouseX: number;
  origMouseY: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OcclusionEditorProps {
  initialImageUrl?: string;
  initialOcclusionData?: OcclusionData;
  onChange: (imageUrl: string, occlusionData: OcclusionData) => void;
}

// ---------------------------------------------------------------------------
// Helper — canvas pointer position
// ---------------------------------------------------------------------------

function canvasPos(
  e: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ---------------------------------------------------------------------------
// Helper — hit-test a corner handle
// ---------------------------------------------------------------------------

function hitHandle(mx: number, my: number, cx: number, cy: number): boolean {
  const half = HANDLE_SIZE;
  return (
    mx >= cx - half && mx <= cx + half && my >= cy - half && my <= cy + half
  );
}

// ---------------------------------------------------------------------------
// Helper — find which handle (if any) is hit for a rect
// ---------------------------------------------------------------------------

function hitRectHandle(
  mx: number,
  my: number,
  rect: OcclusionRect,
  cw: number,
  ch: number,
): 'nw' | 'ne' | 'sw' | 'se' | null {
  const { x, y, width, height } = rect;
  const px = x * cw;
  const py = y * ch;
  const pw = width * cw;
  const ph = height * ch;
  if (hitHandle(mx, my, px, py)) return 'nw';
  if (hitHandle(mx, my, px + pw, py)) return 'ne';
  if (hitHandle(mx, my, px, py + ph)) return 'sw';
  if (hitHandle(mx, my, px + pw, py + ph)) return 'se';
  return null;
}

// ---------------------------------------------------------------------------
// Helper — is point inside rect?
// ---------------------------------------------------------------------------

function insideRect(
  mx: number,
  my: number,
  rect: OcclusionRect,
  cw: number,
  ch: number,
): boolean {
  const px = rect.x * cw;
  const py = rect.y * ch;
  const pw = rect.width * cw;
  const ph = rect.height * ch;
  return mx >= px && mx <= px + pw && my >= py && my <= py + ph;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OcclusionEditor({
  initialImageUrl,
  initialOcclusionData,
  onChange,
}: OcclusionEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>(initialImageUrl ?? '');
  const [rects, setRects] = useState<OcclusionRect[]>(
    initialOcclusionData ?? [],
  );
  const [mode, setMode] = useState<Mode>('draw');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<PendingLabel | null>(null);
  const [labelText, setLabelText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Mutable drag state — not in React state to avoid mid-drag rerenders
  const drawDragRef = useRef<DrawDrag | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const moveDragRef = useRef<MoveDrag | null>(null);

  // Live snapshot of state for use inside stable callbacks
  const liveRef = useRef({ rects, selectedId, mode, pendingLabel });

  // Keep liveRef in sync after each render (must be an effect, not inline)
  useEffect(() => {
    liveRef.current = { rects, selectedId, mode, pendingLabel };
  });

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const { rects: currentRects, selectedId: currentSelected } =
      liveRef.current;

    // Resolve CSS custom property at draw time for theme compatibility
    const accentColor =
      getComputedStyle(canvas).getPropertyValue('--colour-accent').trim() ||
      '#0066cc';
    const neutralColor = '#1e293b';

    for (const rect of currentRects) {
      const px = rect.x * cw;
      const py = rect.y * ch;
      const pw = rect.width * cw;
      const ph = rect.height * ch;
      const isSelected = rect.id === currentSelected;

      // Shaded fill
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = accentColor;
      ctx.fillRect(px, py, pw, ph);
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = isSelected ? neutralColor : accentColor;
      ctx.lineWidth = 2;
      if (isSelected) {
        ctx.setLineDash([6, 3]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.setLineDash([]);

      // Label text
      if (rect.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        const pad = 4;
        const maxW = Math.max(pw - pad * 2, 0);
        ctx.fillText(rect.label, px + pad, py + pad, maxW);
      }

      // Corner handles for selected rect
      if (isSelected) {
        const half = HANDLE_SIZE / 2;
        const corners: [number, number][] = [
          [px, py],
          [px + pw, py],
          [px, py + ph],
          [px + pw, py + ph],
        ];
        ctx.fillStyle = accentColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        for (const [hx, hy] of corners) {
          ctx.fillRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
          ctx.strokeRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
        }
      }
    }

    // Live drag preview during draw mode
    if (drawDragRef.current) {
      const { startX, startY, currentX, currentY } = drawDragRef.current;
      const px = Math.min(startX, currentX);
      const py = Math.min(startY, currentY);
      const pw = Math.abs(currentX - startX);
      const ph = Math.abs(currentY - startY);
      const accentC =
        getComputedStyle(canvas).getPropertyValue('--colour-accent').trim() ||
        '#0066cc';
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = accentC;
      ctx.fillRect(px, py, pw, ph);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accentC;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.setLineDash([]);
    }
  }, []); // stable — reads from liveRef and canvasRef

  // Redraw on every render
  useEffect(() => {
    redraw();
  });

  // ---------------------------------------------------------------------------
  // Canvas sizing — keep canvas in sync with the rendered image
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !imageUrl) return;

    const syncSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = img.clientWidth;
      const h = img.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        redraw();
      }
    };

    const observer = new ResizeObserver(syncSize);
    observer.observe(img);
    // Also sync on first image load
    img.addEventListener('load', syncSize);
    syncSize();

    return () => {
      observer.disconnect();
      img.removeEventListener('load', syncSize);
    };
  }, [imageUrl, redraw]);

  // ---------------------------------------------------------------------------
  // Keyboard — Delete selected rect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!liveRef.current.selectedId) return;
      // Skip if focus is on an input
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const id = liveRef.current.selectedId;
        setRects((prev) => {
          const next = prev.filter((r) => r.id !== id);
          onChange(imageUrl, next);
          return next;
        });
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUrl, onChange]);

  // Focus the label input when it appears
  useEffect(() => {
    if (pendingLabel) {
      setTimeout(() => labelInputRef.current?.focus(), 0);
    }
  }, [pendingLabel]);

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  const processFile = useCallback(
    (file: File) => {
      setUploadError(null);
      if (!ACCEPTED_MIME.has(file.type)) {
        setUploadError(UI.cards.imageUploadErrorFormat);
        return;
      }
      if (file.size > MAX_BYTES) {
        setUploadError(UI.cards.imageUploadErrorSize);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setImageUrl(dataUrl);
        setRects([]);
        setSelectedId(null);
        setPendingLabel(null);
        onChange(dataUrl, []);
      };
      reader.readAsDataURL(file);
    },
    [onChange],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleDropZoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleReplaceImage = () => {
    setImageUrl('');
    setRects([]);
    setSelectedId(null);
    setPendingLabel(null);
    setUploadError(null);
    onChange('', []);
  };

  // ---------------------------------------------------------------------------
  // Canvas pointer events
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      const { x, y } = canvasPos(e, canvas);
      const cw = canvas.width;
      const ch = canvas.height;
      const { mode: currentMode, rects: currentRects } = liveRef.current;

      if (currentMode === 'draw') {
        // Cancel any pending label first
        setPendingLabel(null);
        drawDragRef.current = {
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        };
        redraw();
        return;
      }

      // Select mode — check handles first, then rect bodies
      for (let i = currentRects.length - 1; i >= 0; i--) {
        const rect = currentRects[i];
        if (rect.id === liveRef.current.selectedId) {
          const handle = hitRectHandle(x, y, rect, cw, ch);
          if (handle) {
            resizeDragRef.current = {
              rectId: rect.id,
              handle,
              origRect: { ...rect },
              origMouseX: x,
              origMouseY: y,
            };
            return;
          }
        }
      }

      for (let i = currentRects.length - 1; i >= 0; i--) {
        const rect = currentRects[i];
        if (insideRect(x, y, rect, cw, ch)) {
          setSelectedId(rect.id);
          moveDragRef.current = {
            rectId: rect.id,
            origRect: { ...rect },
            origMouseX: x,
            origMouseY: y,
          };
          return;
        }
      }

      // Nothing hit — deselect
      setSelectedId(null);
    },
    [redraw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = canvasPos(e, canvas);
      const cw = canvas.width;
      const ch = canvas.height;

      if (drawDragRef.current) {
        drawDragRef.current = {
          ...drawDragRef.current,
          currentX: x,
          currentY: y,
        };
        redraw();
        return;
      }

      if (resizeDragRef.current) {
        const { rectId, handle, origRect, origMouseX, origMouseY } =
          resizeDragRef.current;
        const dx = (x - origMouseX) / cw;
        const dy = (y - origMouseY) / ch;

        let nx = origRect.x;
        let ny = origRect.y;
        let nw = origRect.width;
        let nh = origRect.height;

        if (handle === 'nw') {
          nx = origRect.x + dx;
          ny = origRect.y + dy;
          nw = origRect.width - dx;
          nh = origRect.height - dy;
        } else if (handle === 'ne') {
          ny = origRect.y + dy;
          nw = origRect.width + dx;
          nh = origRect.height - dy;
        } else if (handle === 'sw') {
          nx = origRect.x + dx;
          nw = origRect.width - dx;
          nh = origRect.height + dy;
        } else if (handle === 'se') {
          nw = origRect.width + dx;
          nh = origRect.height + dy;
        }

        // Normalise so width/height are always positive
        if (nw < 0) {
          nx += nw;
          nw = -nw;
        }
        if (nh < 0) {
          ny += nh;
          nh = -nh;
        }
        // Clamp to [0, 1]
        nx = Math.max(0, Math.min(nx, 1 - nw));
        ny = Math.max(0, Math.min(ny, 1 - nh));
        nw = Math.min(nw, 1 - nx);
        nh = Math.min(nh, 1 - ny);

        setRects((prev) => {
          const next = prev.map((r) =>
            r.id === rectId ? { ...r, x: nx, y: ny, width: nw, height: nh } : r,
          );
          return next;
        });
        return;
      }

      if (moveDragRef.current) {
        const { rectId, origRect, origMouseX, origMouseY } =
          moveDragRef.current;
        const dx = (x - origMouseX) / cw;
        const dy = (y - origMouseY) / ch;

        let nx = origRect.x + dx;
        let ny = origRect.y + dy;
        nx = Math.max(0, Math.min(nx, 1 - origRect.width));
        ny = Math.max(0, Math.min(ny, 1 - origRect.height));

        setRects((prev) =>
          prev.map((r) => (r.id === rectId ? { ...r, x: nx, y: ny } : r)),
        );
      }
    },
    [redraw],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = canvasPos(e, canvas);
      const cw = canvas.width;
      const ch = canvas.height;

      if (drawDragRef.current) {
        const { startX, startY } = drawDragRef.current;
        const rx = Math.min(startX, x) / cw;
        const ry = Math.min(startY, y) / ch;
        const rw = Math.abs(x - startX) / cw;
        const rh = Math.abs(y - startY) / ch;
        drawDragRef.current = null;
        redraw();

        if (rw >= MIN_FRACTION && rh >= MIN_FRACTION) {
          // Show inline label input at bottom of the drawn rect
          const inputLeft = Math.min(startX, x);
          const inputTop = Math.max(startY, y) + 6;
          setPendingLabel({
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            inputLeft,
            inputTop,
          });
          setLabelText('');
        }
        return;
      }

      if (resizeDragRef.current) {
        // Persist the final rect state to onChange
        const { rects: finalRects } = liveRef.current;
        onChange(imageUrl, finalRects);
        resizeDragRef.current = null;
        return;
      }

      if (moveDragRef.current) {
        const { rects: finalRects } = liveRef.current;
        onChange(imageUrl, finalRects);
        moveDragRef.current = null;
      }
    },
    [imageUrl, onChange, redraw],
  );

  // ---------------------------------------------------------------------------
  // Label confirm / cancel
  // ---------------------------------------------------------------------------

  const confirmLabel = useCallback(() => {
    if (!pendingLabel) return;
    const newRect: OcclusionRect = {
      id: uuidv4(),
      label: labelText.trim(),
      x: pendingLabel.x,
      y: pendingLabel.y,
      width: pendingLabel.width,
      height: pendingLabel.height,
    };
    setRects((prev) => {
      const next = [...prev, newRect];
      onChange(imageUrl, next);
      return next;
    });
    setPendingLabel(null);
    setLabelText('');
  }, [imageUrl, labelText, onChange, pendingLabel]);

  const cancelLabel = useCallback(() => {
    setPendingLabel(null);
    setLabelText('');
  }, []);

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmLabel();
    } else if (e.key === 'Escape') {
      cancelLabel();
    }
  };

  // ---------------------------------------------------------------------------
  // Mode switch
  // ---------------------------------------------------------------------------

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSelectedId(null);
    setPendingLabel(null);
    drawDragRef.current = null;
    resizeDragRef.current = null;
    moveDragRef.current = null;
  };

  // ---------------------------------------------------------------------------
  // Render — upload zone
  // ---------------------------------------------------------------------------

  if (!imageUrl) {
    return (
      <div className={styles.editor}>
        <div
          className={`${styles.uploadZone} ${isDragOver ? styles.uploadZoneActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropZoneDrop}
          onClick={() =>
            document.getElementById('occlusion-file-input')?.click()
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              document.getElementById('occlusion-file-input')?.click();
            }
          }}
          aria-label={UI.cards.imageUploadPrompt}
        >
          <p className={styles.uploadPrompt}>{UI.cards.imageUploadPrompt}</p>
          <p className={styles.uploadFormats}>{UI.cards.imageUploadFormats}</p>
          <input
            id="occlusion-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={styles.fileInput}
            onChange={handleFileInput}
          />
        </div>
        {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — editing canvas
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'draw' ? styles.modeActive : ''}`}
          onClick={() => switchMode('draw')}
        >
          {UI.cards.occlusionDrawMode}
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'select' ? styles.modeActive : ''}`}
          onClick={() => switchMode('select')}
        >
          {UI.cards.occlusionSelectMode}
        </button>
        <button
          type="button"
          className={styles.replaceButton}
          onClick={handleReplaceImage}
        >
          {UI.cards.imageReplaceButton}
        </button>
      </div>

      {mode === 'select' && selectedId && (
        <p className={styles.deleteHint}>{UI.cards.occlusionDeleteHint}</p>
      )}

      <div className={styles.canvasContainer}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          className={styles.image}
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className={`${styles.canvas} ${mode === 'draw' ? styles.canvasDraw : styles.canvasSelect}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        {pendingLabel && (
          <div
            className={styles.labelInputWrapper}
            style={{ left: pendingLabel.inputLeft, top: pendingLabel.inputTop }}
          >
            <span className={styles.labelPrompt}>
              {UI.cards.occlusionLabelPrompt}
            </span>
            <input
              ref={labelInputRef}
              type="text"
              className={styles.labelInput}
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              placeholder=""
              aria-label={UI.cards.occlusionLabelPrompt}
            />
            <button
              type="button"
              className={styles.labelConfirmButton}
              onClick={confirmLabel}
            >
              {UI.cards.occlusionLabelConfirm}
            </button>
            <button
              type="button"
              className={styles.labelCancelButton}
              onClick={cancelLabel}
            >
              {UI.cards.occlusionLabelCancel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
