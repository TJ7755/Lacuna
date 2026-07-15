// Subtle marker shown on cards generated from a Sequence, styled consistently with the
// Suspended/Buried metadata pills already used on CardRow (see CardList.tsx). Deliberately
// name-free — the owning sequence's name is shown in the group header wherever cards are
// grouped, and this badge alone is enough context outside that grouping (search results,
// the command palette, and orphaned generated cards CardList cannot resolve a group for).

import { PathIcon } from '../ui/icons';

export function SequenceBadge() {
  return (
    <span
      title="Generated from a sequence"
      className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-faint"
    >
      <PathIcon width={10} height={10} />
      Sequence
    </span>
  );
}
