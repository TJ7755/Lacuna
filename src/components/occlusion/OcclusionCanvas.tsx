// Drawing surface for the occlusion editor (Task 10, D1 adapted — design/arc6/plan.md
// §6.5). Wraps the shared OcclusionMaskLayer (never a second mask renderer) with pointer
// handling that turns a drag into a rectangle, converted to fractions of the image on
// capture — never pixels — so masks hold their position under FlipCard's responsive
// sizing (§6.2). Pointer events unify mouse and touch, so drawing works on a touch
// screen without any dedicated optimisation (§6.10.5).

import { useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { UploadIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { OcclusionMaskLayer, type OcclusionMaskRegion } from './OcclusionMaskLayer';
import type { OcclusionRegion } from '../../db/types';

/** Ignore drags shorter than this fraction of the image in either dimension — a tap or
 *  jitter should never create a sliver region. */
const MIN_DRAG_FRACTION = 0.01;

export type OcclusionDrawTool = 'label' | 'feature' | 'select';

export interface DrawnRegionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OcclusionCanvasProps {
  /** Resolved object URL for the diagram, or null before one has been uploaded. */
  assetUrl: string | null;
  alt: string;
  regions: OcclusionRegion[];
  selectedRegionId: string | null;
  tool: OcclusionDrawTool;
  onToolChange: (tool: OcclusionDrawTool) => void;
  onRegionDrawn: (rect: DrawnRegionRect) => void;
  onSelectRegion: (id: string) => void;
  onFileSelected: (file: File) => void;
  uploading: boolean;
  /** True while the "replace this diagram?" warning is showing in place of the
   *  upload button (§6.4: replacing the image regenerates every card and must warn first). */
  confirmingReplace: boolean;
  onConfirmReplace: () => void;
  onCancelReplace: () => void;
}

export function OcclusionCanvas({
  assetUrl,
  alt,
  regions,
  selectedRegionId,
  tool,
  onToolChange,
  onRegionDrawn,
  onSelectRegion,
  onFileSelected,
  uploading,
  confirmingReplace,
  onConfirmReplace,
  onCancelReplace,
}: OcclusionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ rect: DOMRect; startX: number; startY: number } | null>(null);
  const [draft, setDraft] = useState<DrawnRegionRect | null>(null);

  function fractionFromPoint(rect: DOMRect, clientX: number, clientY: number) {
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'select' || !assetUrl || e.button !== 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const { x, y } = fractionFromPoint(rect, e.clientX, e.clientY);
    dragRef.current = { rect, startX: x, startY: y };
    setDraft({ x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = fractionFromPoint(drag.rect, e.clientX, e.clientY);
    setDraft({
      x: Math.min(drag.startX, x),
      y: Math.min(drag.startY, y),
      w: Math.abs(x - drag.startX),
      h: Math.abs(y - drag.startY),
    });
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    const finished = draft;
    setDraft(null);
    if (!drag || !finished) return;
    if (finished.w < MIN_DRAG_FRACTION || finished.h < MIN_DRAG_FRACTION) return;
    onRegionDrawn(finished);
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFileSelected(file);
  }

  const maskRegions: OcclusionMaskRegion[] = regions.map((region) => ({
    id: region.id,
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    visual: region.id === selectedRegionId ? 'selected' : 'draft',
  }));
  if (draft) {
    maskRegions.push({ id: '__draft__', x: draft.x, y: draft.y, w: draft.w, h: draft.h, visual: 'draft' });
  }

  return (
    <div className="min-w-0 bg-surface">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <ToolButton label="Draw label box" active={tool === 'label'} onClick={() => onToolChange('label')} />
        <ToolButton label="Draw feature" active={tool === 'feature'} onClick={() => onToolChange('feature')} />
        <ToolButton label="Select" active={tool === 'select'} onClick={() => onToolChange('select')} />
        <div className="flex-1" />
        {confirmingReplace ? (
          <ConfirmInline
            message="Regenerate every card in this occlusion?"
            confirmLabel="Replace"
            onConfirm={onConfirmReplace}
            onCancel={onCancelReplace}
          />
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePick}
              aria-label={assetUrl ? 'Replace diagram' : 'Upload diagram'}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon width={14} height={14} />
              {uploading ? 'Uploading…' : assetUrl ? 'Replace image' : 'Upload diagram'}
            </Button>
          </>
        )}
      </div>

      <div className="p-3">
        {assetUrl ? (
          <div
            ref={containerRef}
            data-testid="occlusion-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn('touch-none', tool !== 'select' && 'cursor-crosshair')}
          >
            <OcclusionMaskLayer
              assetUrl={assetUrl}
              alt={alt}
              regions={maskRegions}
              onRegionClick={tool === 'select' ? onSelectRegion : undefined}
            />
          </div>
        ) : (
          <div className="grid aspect-[16/10] place-items-center rounded-xl border border-dashed border-line-strong text-center text-sm text-ink-faint">
            Upload a diagram to begin.
          </div>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          Drag to draw. Coordinates are stored as fractions of the image, so masks hold their place at
          any size.
        </p>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function ToolButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
