// Header + card list for one sequence's generated cards within CardList — grouped rather
// than loose so their shared origin (and the "Edit sequence" affordance) is obvious at a
// glance. Reuses CardListBody/CardRow for the cards themselves, so a generated card gets
// the exact same read-only treatment (no checkbox, no delete, a subtle badge) it would if
// it were rendered inline; see CardList.tsx's `generated` guard on CardRow.

import { useState } from 'react';
import { PathIcon } from '../ui/icons';
import { CardListBody } from './CardList';
import type { Card, Deck, Sequence } from '../../db/types';

interface SequenceCardGroupProps {
  sequence: Sequence;
  cards: Card[];
  deck: Deck;
  onEditCard: (card: Card) => void;
  onEditSequence?: (sequenceId: string) => void;
  onResume: (card: Card) => void;
  onToggleFlag: (card: Card) => void;
  motionMultiplier: number;
}

export function SequenceCardGroup({
  sequence,
  cards,
  deck,
  onEditCard,
  onEditSequence,
  onResume,
  onToggleFlag,
  motionMultiplier,
}: SequenceCardGroupProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 bg-ink/[0.03] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <PathIcon width={15} height={15} className="shrink-0 text-ink-faint" />
          <span className="truncate font-medium text-ink">{sequence.name}</span>
          <span className="shrink-0 text-ink-faint">
            {cards.length} card{cards.length === 1 ? '' : 's'}
          </span>
        </div>
        {onEditSequence && (
          <button
            type="button"
            onClick={() => onEditSequence(sequence.id)}
            className="shrink-0 text-sm text-ink-faint transition-colors hover:text-ink"
          >
            Edit sequence
          </button>
        )}
      </div>
      <div className="p-3">
        <CardListBody
          cards={cards}
          deck={deck}
          selectMode={false}
          selected={EMPTY_SELECTION}
          expandedCardId={expandedCardId}
          onToggle={NOOP}
          onToggleExpand={setExpandedCardId}
          onEditCard={onEditCard}
          onResume={onResume}
          onDelete={NOOP}
          onToggleFlag={onToggleFlag}
          motionMultiplier={motionMultiplier}
        />
      </div>
    </div>
  );
}

// Stable references so CardListBody/CardRow never see spurious prop changes.
const EMPTY_SELECTION = new Set<string>();
function NOOP() {
  // Selection and delete are unreachable for generated cards (see CardList's `generated`
  // guard), but CardListBody requires the callbacks regardless.
}
