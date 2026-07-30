import { cn } from '../ui/cn';

/**
 * A region's presentation state, purely for rendering — never a masking decision. Study
 * (Task 9) derives these from `resolveOcclusionFace`'s already-resolved sets; the
 * authoring canvas (Task 10) is expected to add its own draw/selection states without
 * needing to touch the study call sites.
 *
 *  - `masked` — an opaque label mask, not this card's target.
 *  - `target` — this card's target region, ringed; masked when it covers printed text
 *    (a label target), unmasked when it points at the drawing (a feature target, see
 *    `ring`  below — `target` is only used for a *masked* ringed region).
 *  - `ring` — an unmasked ringed region (a feature target, which was never masked).
 *  - `lifted` — a mask just removed on the back, shown as a revealed outline.
 */
export type OcclusionRegionVisual = 'masked' | 'target' | 'ring' | 'lifted' | 'selected' | 'draft';

export interface OcclusionMaskRegion {
  id: string;
  /** Fractions of image width/height, 0..1 — see `OcclusionRegion` in src/db/types.ts. */
  x: number;
  y: number;
  w: number;
  h: number;
  visual: OcclusionRegionVisual;
}

const VISUAL_CLASSES: Record<OcclusionRegionVisual, string> = {
  masked: 'rounded-[3px] border border-ink/55 bg-ink/88 dark:border-ink-faint/80 dark:bg-ink-faint/62',
  target:
    'rounded-[3px] border-2 border-accent bg-ink/88 ring-[3px] ring-accent/22 dark:bg-ink-faint/62',
  ring: 'rounded-full border-2 border-accent bg-transparent ring-[3px] ring-accent/18',
  lifted:
    'rounded-[3px] border border-dashed border-positive bg-transparent ring-[3px] ring-positive/14',
  selected: 'rounded-[3px] border-2 border-accent bg-accent/13 ring-[3px] ring-accent/18',
  draft: 'rounded-[3px] border border-dashed border-ink-faint bg-ink-faint/12',
};

/** Visuals that show a centred "?" mark — the question being asked, matching the chosen
 *  label-box study mockup (design/arc6/mockups-occlusion.html). */
const QUESTION_MARK_VISUALS = new Set<OcclusionRegionVisual>(['target', 'ring']);

export interface OcclusionMaskLayerProps {
  /** Resolved object URL for the diagram. Callers resolve `lacuna-asset://` hashes
   *  themselves (see src/db/assetCache.ts's `resolveAssetUrl`) before mounting this
   *  component — it never touches the asset store directly. */
  assetUrl: string;
  /** Accessible name for the diagram image. */
  alt: string;
  regions: OcclusionMaskRegion[];
  /**
   * Optional per-region activation (click or Enter/Space), for interactive consumers
   * such as the authoring canvas. Left unset in study, where the whole card handles
   * reveal — the same keyboard- and pointer-operable pattern every other card type
   * already uses (see FlipCard.tsx) — so regions stay presentational there.
   */
  onRegionClick?: (regionId: string) => void;
  className?: string;
}

/**
 * Presentational occlusion-diagram renderer shared by the study face (Task 9) and the
 * authoring canvas (Task 10). Regions are positioned in percentages derived directly from
 * their stored fractions (never pixels, never measured via JS layout): the image and
 * every overlay share one percentage-based coordinate space, so a mask tracks the image
 * at any container width, zoom level or device-pixel ratio, and in both themes (the fill
 * and ring colours below resolve through the app's existing `ink`/`accent`/`positive`
 * tokens, which already carry correct light/dark values).
 */
export function OcclusionMaskLayer({
  assetUrl,
  alt,
  regions,
  onRegionClick,
  className,
}: OcclusionMaskLayerProps) {
  const interactive = Boolean(onRegionClick);
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-line bg-surface-raised',
        className,
      )}
    >
      <img src={assetUrl} alt={alt} className="block w-full select-none" draggable={false} />
      {regions.map((region) => (
        <div
          key={region.id}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-hidden={interactive ? undefined : true}
          onClick={interactive ? () => onRegionClick?.(region.id) : undefined}
          onKeyDown={
            interactive
              ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onRegionClick?.(region.id);
                }
              : undefined
          }
          className={cn(
            'absolute',
            VISUAL_CLASSES[region.visual],
            interactive && 'cursor-pointer outline-none',
          )}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.w * 100}%`,
            height: `${region.h * 100}%`,
          }}
        >
          {QUESTION_MARK_VISUALS.has(region.visual) && (
            <span aria-hidden className="grid h-full place-items-center text-xs font-medium text-accent">
              ?
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
