import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useVirtualList } from '../../hooks/useVirtualList';
import type { Card, Occlusion, SchedulerConfig } from '@lacuna/core/db/types';
import { CardRow } from './CardRow';
import { useCardSectionActivity, useCardSectionEntranceExpired } from './CardSections';

// Moderate image groups can still extend beyond the viewport and decode together.
const VIRTUAL_THRESHOLD = 12;

/** Longest possible entry animation: the capped stagger plus one row's fade. */
const INTRO_WINDOW_MS = 420;

/** Renders the card list either as a simple grid (small decks) or a virtualised
 *  absolute-positioned list (large decks) to keep performance constant. Shared with
 *  GeneratedCardGroup, which renders a sequence's or occlusion's own
 *  generated cards through the same CardRow (and so gets its read-only treatment for free). */
export function CardListBody({
  cards,
  schedulingConfig,
  scheduleNow,
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
  occlusionByRegion,
  compactMetadata = false,
}: {
  cards: Card[];
  schedulingConfig: SchedulerConfig;
  scheduleNow: number;
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
  occlusionByRegion: ReadonlyMap<string, Occlusion>;
  compactMetadata?: boolean;
}) {
  const enabled = cards.length > VIRTUAL_THRESHOLD;
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const focusedIndex = useMemo(
    () => (focusedCardId === null ? -1 : cards.findIndex((card) => card.id === focusedCardId)),
    [cards, focusedCardId],
  );
  useCardSectionActivity(focusedIndex !== -1);
  const pinnedIndices = useMemo(() => {
    if (!enabled || (focusedIndex === -1 && expandedCardId === null)) return undefined;
    const expandedIndex =
      expandedCardId === null ? -1 : cards.findIndex((card) => card.id === expandedCardId);
    return [focusedIndex, expandedIndex].filter((index) => index >= 0);
  }, [enabled, cards, focusedIndex, expandedCardId]);
  const { totalHeight, virtualItems, measureRef, containerRef } = useVirtualList({
    itemCount: cards.length,
    estimateSize: 100,
    gap: 4,
    overscan: 5,
    enabled,
    pinnedIndices,
  });

  useLayoutEffect(() => {
    // Filtering or crossing the windowing threshold can remove the focused DOM node.
    if (focusedCardId !== null && !containerRef.current?.contains(document.activeElement)) {
      setFocusedCardId(null);
    }
  }, [containerRef, enabled, focusedCardId, focusedIndex]);

  // Cards fade in once, as the list's own entrance, and never again. Scrolling a
  // virtual window is not an entrance: rows revealed by scrolling previously
  // animated on first sight, which made the effect look arbitrary because whether
  // a given card faded depended on how far the list had been scrolled before.
  const previouslyMounted = useCardSectionEntranceExpired(INTRO_WINDOW_MS * motionMultiplier);
  const [introDone, setIntroDone] = useState(previouslyMounted);
  useEffect(() => {
    if (introDone || cards.length === 0) return;
    const id = window.setTimeout(() => setIntroDone(true), INTRO_WINDOW_MS * motionMultiplier);
    return () => window.clearTimeout(id);
  }, [introDone, cards.length, motionMultiplier]);
  const toggleExpanded = useCallback(
    (id: string) => onToggleExpand((previous) => (previous === id ? null : id)),
    [onToggleExpand],
  );
  const renderRow = (card: Card, position: number) => (
    <CardRow
      key={card.id}
      card={card}
      schedulingConfig={schedulingConfig}
      scheduleNow={scheduleNow}
      // After the entrance the window-relative index no longer affects this row.
      staggerIndex={introDone ? 0 : position}
      skipAnimation={introDone}
      selectMode={selectMode}
      selected={selected.has(card.id)}
      expanded={expandedCardId === card.id}
      onToggle={onToggle}
      onToggleExpand={toggleExpanded}
      onEdit={onEditCard}
      onResume={onResume}
      onDelete={onDelete}
      linked={linkedCardIds?.has(card.id) === true}
      onUnlink={onUnlinkCard}
      onToggleFlag={onToggleFlag}
      motionMultiplier={motionMultiplier}
      compactMetadata={compactMetadata}
      occlusion={
        card.occlusionRegionId === null || card.occlusionRegionId === undefined
          ? undefined
          : occlusionByRegion.get(card.occlusionRegionId)
      }
    />
  );

  return (
    <div
      ref={containerRef}
      className={enabled ? 'relative' : 'grid gap-1'}
      style={enabled ? { height: totalHeight } : undefined}
      onFocus={(event) => {
        const row = event.target.closest<HTMLElement>('[data-card-row]');
        if (row && event.currentTarget.contains(row)) setFocusedCardId(row.dataset.cardRow ?? null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedCardId(null);
      }}
    >
      {enabled
        ? virtualItems.map(({ index, start }, position) => {
            const card = cards[index];
            return (
              <div
                key={card.id}
                ref={measureRef(index)}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${start}px)` }}
              >
                {renderRow(card, position)}
              </div>
            );
          })
        : cards.map(renderRow)}
    </div>
  );
}
