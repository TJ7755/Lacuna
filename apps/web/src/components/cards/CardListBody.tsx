import { useEffect, useState } from 'react';
import { useVirtualList } from '../../hooks/useVirtualList';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import type { Card, Occlusion, SchedulerConfig } from '@lacuna/core/db/types';
import { CardRow } from './CardRow';

const VIRTUAL_THRESHOLD = 50;

/** Longest possible entry animation: the capped stagger plus one row's fade. */
const INTRO_WINDOW_MS = 420;

/** Renders the card list either as a simple grid (small decks) or a virtualised
 *  absolute-positioned list (large decks) to keep performance constant. Shared with
 *  GeneratedCardGroup, which renders a sequence's or occlusion's own
 *  generated cards through the same CardRow (and so gets its read-only treatment for free). */
export function CardListBody({
  cards,
  schedulingConfig,
  selectMode,
  selected,
  expandedCardId,
  onToggle,
  onToggleExpand,
  onEditCard,
  onResume,
  onDelete,
  onToggleFlag,
  linkedCardIds,
  onUnlinkCard,
  motionMultiplier,
  occlusions,
  compactMetadata = false,
}: {
  cards: Card[];
  schedulingConfig: SchedulerConfig;
  selectMode: boolean;
  selected: Set<string>;
  expandedCardId: string | null;
  onToggle: (id: string) => void;
  onToggleExpand: React.Dispatch<React.SetStateAction<string | null>>;
  onEditCard: (card: Card) => void;
  onResume: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleFlag: (card: Card) => void;
  linkedCardIds?: ReadonlySet<string>;
  onUnlinkCard?: (card: Card) => void;
  motionMultiplier: number;
  /** Occlusions that may own these cards, so occlusion rows can show their diagram. */
  occlusions?: Occlusion[];
  compactMetadata?: boolean;
}) {
  const enabled = cards.length > VIRTUAL_THRESHOLD;
  const occlusionOf = (card: Card) =>
    card.occlusionRegionId !== undefined && card.occlusionRegionId !== null && occlusions
      ? occlusionForRegionId(occlusions, card.occlusionRegionId)
      : undefined;
  const { totalHeight, virtualItems, measureRef, containerRef } = useVirtualList({
    itemCount: cards.length,
    estimateSize: 100,
    gap: 4,
    overscan: 5,
    enabled,
  });

  // Cards fade in once, as the list's own entrance, and never again. Scrolling a
  // virtual window is not an entrance: rows revealed by scrolling previously
  // animated on first sight, which made the effect look arbitrary because whether
  // a given card faded depended on how far the list had been scrolled before.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    if (introDone || cards.length === 0) return;
    const id = window.setTimeout(() => setIntroDone(true), INTRO_WINDOW_MS * motionMultiplier);
    return () => window.clearTimeout(id);
  }, [introDone, cards.length, motionMultiplier]);

  if (!enabled) {
    return (
      <div className="grid gap-1">
        {cards.map((card, i) => (
          <CardRow
            key={card.id}
            card={card}
            schedulingConfig={schedulingConfig}
            staggerIndex={i}
            skipAnimation={introDone}
            selectMode={selectMode}
            selected={selected.has(card.id)}
            expanded={expandedCardId === card.id}
            onToggle={() => onToggle(card.id)}
            onToggleExpand={() => onToggleExpand((prev) => (prev === card.id ? null : card.id))}
            onEdit={() => onEditCard(card)}
            onResume={() => onResume(card)}
            onDelete={() => onDelete(card.id)}
            linked={linkedCardIds?.has(card.id) === true}
            onUnlink={() => onUnlinkCard?.(card)}
            onToggleFlag={onToggleFlag}
            motionMultiplier={motionMultiplier}
            compactMetadata={compactMetadata}
            occlusion={occlusionOf(card)}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" style={{ height: totalHeight }}>
      {virtualItems.map(({ index, start }, position) => {
        const card = cards[index];
        return (
          <div
            key={card.id}
            ref={measureRef(index)}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${start}px)` }}
          >
            <CardRow
              card={card}
              schedulingConfig={schedulingConfig}
              staggerIndex={position}
              selectMode={selectMode}
              selected={selected.has(card.id)}
              expanded={expandedCardId === card.id}
              onToggle={() => onToggle(card.id)}
              onToggleExpand={() => onToggleExpand((prev) => (prev === card.id ? null : card.id))}
              onEdit={() => onEditCard(card)}
              onResume={() => onResume(card)}
              onDelete={() => onDelete(card.id)}
              linked={linkedCardIds?.has(card.id) === true}
              onUnlink={() => onUnlinkCard?.(card)}
              onToggleFlag={onToggleFlag}
              motionMultiplier={motionMultiplier}
              skipAnimation={introDone}
              compactMetadata={compactMetadata}
              occlusion={occlusionOf(card)}
            />
          </div>
        );
      })}
    </div>
  );
}
