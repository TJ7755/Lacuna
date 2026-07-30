import { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../../db/assetCache';
import { resolveOcclusionFace } from '../../db/occlusionGeneration';
import type { Card, Occlusion } from '../../db/types';
import { MarkdownView } from '../markdown/MarkdownView';
import { cn } from '../ui/cn';
import { OcclusionMaskLayer, type OcclusionMaskRegion, type OcclusionRegionVisual } from './OcclusionMaskLayer';

/**
 * Renders one side of an occlusion-generated card: the diagram with regions masked,
 * ringed or lifted per `resolveOcclusionFace`'s already-resolved decisions — this
 * component never re-derives which regions to mask (see occlusionGeneration.ts's module
 * doc). Falls back to the card's plain-text front/back fallback when the owning region
 * can't be resolved (a region removed since the card was generated) or the diagram asset
 * itself is missing, so a broken reference degrades to legible text rather than a broken
 * or blank image (§6.4).
 */
export function OcclusionStudyFace({
  card,
  occlusion,
  side,
  className,
}: {
  card: Card & { occlusionRegionId: string };
  occlusion: Occlusion;
  side: 'front' | 'back';
  className?: string;
}) {
  const face = resolveOcclusionFace(occlusion, card.occlusionRegionId);
  // Tri-state: undefined while resolving (renders nothing, avoiding a fallback-text
  // flash before the — typically near-instant, IndexedDB-backed — asset resolves), null
  // once resolution confirms the asset is missing.
  const [assetUrl, setAssetUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!face) return;
    let cancelled = false;
    setAssetUrl(undefined);
    void resolveAssetUrl(occlusion.assetHash).then((url) => {
      if (!cancelled) setAssetUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // `face` is recomputed fresh every render (a plain object, not memoised) — depending
    // on it directly would re-run this effect (and reset assetUrl) on every render.
    // Depending on the region id instead captures the same "does this card's region
    // still resolve" condition without that churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occlusion.assetHash, card.occlusionRegionId]);

  const fallback = (
    <MarkdownView source={side === 'front' ? card.front : card.back} className={className} />
  );

  if (!face) return fallback;
  if (assetUrl === null) return fallback;
  if (assetUrl === undefined) return null;

  const regions: OcclusionMaskRegion[] = occlusion.regions
    .filter((region) => face.frontMaskedRegionIds.includes(region.id) || region.id === face.targetRegionId)
    .map((region) => {
      const isMasked = face.frontMaskedRegionIds.includes(region.id);
      const isLifted = side === 'back' && region.id === face.backLiftedRegionId;
      const isTarget = region.id === face.targetRegionId;
      const visual: OcclusionRegionVisual = isLifted ? 'lifted' : isTarget ? (isMasked ? 'target' : 'ring') : 'masked';
      return { id: region.id, x: region.x, y: region.y, w: region.w, h: region.h, visual };
    });

  return (
    <div className={cn('text-left', className)}>
      <OcclusionMaskLayer assetUrl={assetUrl} alt={occlusion.name} regions={regions} />
      {side === 'back' && face.answerText !== undefined && (
        <p className="mt-4 text-center text-lg text-ink">{face.answerText}</p>
      )}
      {side === 'back' && face.backNote && (
        <p className="mt-3 text-center text-sm text-ink-soft">{face.backNote}</p>
      )}
    </div>
  );
}
