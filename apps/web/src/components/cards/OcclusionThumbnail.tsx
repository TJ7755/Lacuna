import { OcclusionStudyFace } from '../occlusion/OcclusionStudyFace';
import type { Card, Occlusion } from '../../db/types';

/**
 * A small preview of an occlusion card's question side, so a list of them shows which
 * region each card asks about rather than repeating the word "Occlusion". The study face
 * already resolves the masks; this only frames it. Purely visual: the row names the card.
 */
export function OcclusionThumbnail({ card, occlusion }: { card: Card; occlusion: Occlusion }) {
  return (
    <div
      aria-hidden="true"
      data-occlusion-thumbnail
      className="pointer-events-none grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink/[0.04] [&_[aria-hidden]>span]:hidden [&_p]:hidden"
    >
      <OcclusionStudyFace
        card={card as Card & { occlusionRegionId: string }}
        occlusion={occlusion}
        side="front"
        className="w-full [&>div]:rounded-none"
      />
    </div>
  );
}
