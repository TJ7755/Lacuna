// Subtle marker shown on cards generated from a Sequence or an Occlusion, styled
// consistently with the Suspended/Buried metadata pills already used on CardRow (see
// CardList.tsx). Deliberately name-free — the owning sequence/occlusion's name is shown
// in the group header wherever cards are grouped, and this badge alone is enough context
// outside that grouping (search results, Quick search, and orphaned generated
// cards CardList cannot resolve a group for). One component parameterised by kind rather
// than two near-identical files, since the two idioms differ only in icon and label.

import { ImageIcon, PathIcon } from '../ui/icons';

const KIND_META = {
  sequence: { Icon: PathIcon, label: 'Sequence', title: 'Generated from a sequence' },
  occlusion: { Icon: ImageIcon, label: 'Occlusion', title: 'Generated from an occlusion' },
} as const;

export function GeneratedCardBadge({ kind }: { kind: keyof typeof KIND_META }) {
  const { Icon, label, title } = KIND_META[kind];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-faint"
    >
      <Icon width={10} height={10} />
      {label}
    </span>
  );
}
