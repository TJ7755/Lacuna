// Header + card list for one Sequence's or Occlusion's generated cards within CardList —
// grouped rather than loose so their shared origin (and the "Edit sequence"/"Edit
// occlusion" affordance) is obvious at a glance. Reuses CardListBody/CardRow for the
// cards themselves, so a generated card gets the exact same read-only treatment (no
// checkbox, no delete, a subtle badge) it would if it were rendered inline; see
// CardList.tsx's `generated` guard on CardRow. Parameterised by kind rather than split
// into two near-identical components, since a sequence group and an occlusion group
// differ only in icon and edit-button label.

import { useState } from 'react';
import { PathIcon, ImageIcon } from '../ui/icons';
import { CardListBody } from './CardList';
import type { Card, SchedulerConfig } from '../../db/types';

/** The minimal shape of a generated card's owner (a Sequence or an Occlusion) this group needs. */
interface GeneratedCardOwner {
  id: string;
  name: string;
}

interface GeneratedCardGroupProps {
  kind: 'sequence' | 'occlusion';
  owner: GeneratedCardOwner;
  cards: Card[];
  schedulingConfig: SchedulerConfig;
  onEditCard: (card: Card) => void;
  onEditOwner?: (ownerId: string) => void;
  onResume: (card: Card) => void;
  onToggleFlag: (card: Card) => void;
  linkedCardIds?: ReadonlySet<string>;
  onUnlinkCard?: (card: Card) => void;
  motionMultiplier: number;
}

const KIND_META = {
  sequence: { Icon: PathIcon, editLabel: 'Edit sequence' },
  occlusion: { Icon: ImageIcon, editLabel: 'Edit occlusion' },
} as const;

export function GeneratedCardGroup({
  kind,
  owner,
  cards,
  schedulingConfig,
  onEditCard,
  onEditOwner,
  onResume,
  onToggleFlag,
  linkedCardIds,
  onUnlinkCard,
  motionMultiplier,
}: GeneratedCardGroupProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const { Icon, editLabel } = KIND_META[kind];

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 bg-ink/[0.03] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Icon width={15} height={15} className="shrink-0 text-ink-faint" />
          <span className="truncate font-medium text-ink">{owner.name}</span>
          <span className="shrink-0 text-ink-faint">
            {cards.length} card{cards.length === 1 ? '' : 's'}
          </span>
        </div>
        {onEditOwner && (
          <button
            type="button"
            onClick={() => onEditOwner(owner.id)}
            className="shrink-0 text-sm text-ink-faint transition-colors hover:text-ink"
          >
            {editLabel}
          </button>
        )}
      </div>
      <div className="p-3">
        <CardListBody
          cards={cards}
          schedulingConfig={schedulingConfig}
          selectMode={false}
          selected={EMPTY_SELECTION}
          expandedCardId={expandedCardId}
          onToggle={NOOP}
          onToggleExpand={setExpandedCardId}
          onEditCard={onEditCard}
          onResume={onResume}
          onDelete={NOOP}
          onToggleFlag={onToggleFlag}
          linkedCardIds={linkedCardIds}
          onUnlinkCard={onUnlinkCard}
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
