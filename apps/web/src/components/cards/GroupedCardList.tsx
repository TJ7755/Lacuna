import { useMemo, type ComponentProps } from 'react';
import { baseItemId, isLabelCardId, sequenceForItemId } from '../../db/sequenceGeneration';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import type { Card, Occlusion, Sequence } from '@lacuna/core/db/types';
import { CardListBody } from './CardListBody';
import { GeneratedCardGroup } from './GeneratedCardGroup';

type GroupedCardListProps = ComponentProps<typeof CardListBody> & {
  sequences?: Sequence[];
  onEditSequence?: (sequenceId: string) => void;
  onEditOcclusion?: (occlusionId: string) => void;
};

/** Groups generated cards by owner, leaving ordinary and unresolved cards in the loose list. */
export function GroupedCardList({
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
  sequences,
  onEditSequence,
  occlusions,
  onEditOcclusion,
  compactMetadata,
}: GroupedCardListProps) {
  // Generated cards (a sequence item ID or an occlusion region ID) are managed exclusively
  // from their owning sequence/occlusion: they never take part in bulk selection
  // (Tag/Suspend/Delete/…), since content edits and deletes would desync or fight
  // with the next regeneration. Grouping them under a header naming their owner is purely
  // presentational — every card still flows through the same CardListBody/CardRow, which
  // independently enforces the read-only treatment (no checkbox, no delete) from
  // `card.sequenceItemId`/`card.occlusionRegionId` itself.
  interface GeneratedGroup {
    kind: 'sequence' | 'occlusion';
    owner: { id: string; name: string };
    cards: Card[];
  }
  const generatedGroups = useMemo(() => {
    const byOwner = new Map<string, GeneratedGroup>();
    for (const card of cards) {
      if (card.sequenceItemId !== null && card.sequenceItemId !== undefined) {
        const sequence = sequences ? sequenceForItemId(sequences, card.sequenceItemId) : undefined;
        if (!sequence) continue;
        const key = `sequence:${sequence.id}`;
        const group = byOwner.get(key) ?? { kind: 'sequence', owner: sequence, cards: [] };
        group.cards.push(card);
        byOwner.set(key, group);
      } else if (card.occlusionRegionId !== null && card.occlusionRegionId !== undefined) {
        const occlusion = occlusions
          ? occlusionForRegionId(occlusions, card.occlusionRegionId)
          : undefined;
        if (!occlusion) continue;
        const key = `occlusion:${occlusion.id}`;
        const group = byOwner.get(key) ?? { kind: 'occlusion', owner: occlusion, cards: [] };
        group.cards.push(card);
        byOwner.set(key, group);
      }
    }
    // A sequence's cards follow its items, each item's label card after its positional one.
    for (const group of byOwner.values()) {
      if (group.kind !== 'sequence') continue;
      const order = new Map((group.owner as Sequence).items.map((item, i) => [item.id, i]));
      const rank = (card: Card) =>
        (order.get(baseItemId(card.sequenceItemId!)) ?? 0) * 2 +
        (isLabelCardId(card.sequenceItemId!) ? 1 : 0);
      group.cards.sort((a, b) => rank(a) - rank(b));
    }
    // An occlusion's cards follow its regions, so "Label 1 of 4" comes first.
    for (const group of byOwner.values()) {
      if (group.kind !== 'occlusion') continue;
      const order = new Map((group.owner as Occlusion).regions.map((region, i) => [region.id, i]));
      group.cards.sort(
        (a, b) => (order.get(a.occlusionRegionId!) ?? 0) - (order.get(b.occlusionRegionId!) ?? 0),
      );
    }
    return [...byOwner.values()];
  }, [cards, sequences, occlusions]);

  const groupedCardIds = useMemo(
    () => new Set(generatedGroups.flatMap((g) => g.cards.map((c) => c.id))),
    [generatedGroups],
  );
  // Every card not shown under a group heading: ordinary cards plus any generated card
  // whose owning sequence/occlusion could not be resolved (defensive fallback — still
  // badged/read-only via CardRow, just without a group header to sit under).
  const looseCards = useMemo(
    () => cards.filter((c) => !groupedCardIds.has(c.id)),
    [cards, groupedCardIds],
  );
  return (
    <>
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-ink-soft">No cards yet.</p>
        </div>
      ) : (
        <>
          {generatedGroups.map((group) => (
            <GeneratedCardGroup
              key={`${group.kind}:${group.owner.id}`}
              kind={group.kind}
              owner={group.owner}
              cards={group.cards}
              schedulingConfig={schedulingConfig}
              onEditCard={onEditCard}
              onEditOwner={group.kind === 'sequence' ? onEditSequence : onEditOcclusion}
              onResume={onResume}
              onToggleFlag={onToggleFlag}
              linkedCardIds={linkedCardIds}
              onUnlinkCard={onUnlinkCard}
              motionMultiplier={motionMultiplier}
              compactMetadata={compactMetadata}
              occlusions={occlusions}
            />
          ))}
          {looseCards.length > 0 && (
            <CardListBody
              cards={looseCards}
              schedulingConfig={schedulingConfig}
              selectMode={selectMode}
              selected={selected}
              expandedCardId={expandedCardId}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
              onEditCard={onEditCard}
              onResume={onResume}
              onDelete={onDelete}
              onToggleFlag={onToggleFlag}
              linkedCardIds={linkedCardIds}
              onUnlinkCard={onUnlinkCard}
              motionMultiplier={motionMultiplier}
              compactMetadata={compactMetadata}
              occlusions={occlusions}
            />
          )}
        </>
      )}
    </>
  );
}
