import type { Card } from '../../db/types';
import { CardsIcon, FileTextIcon, ImageIcon, PathIcon } from '../ui/icons';
import { cardKindLabel } from './lessonCardRow';

/** The existing kind name stays available without another line beneath the question. */
export function CardKindIcon({ card }: { card: Card }) {
  const label = cardKindLabel(card);
  const Icon =
    label === 'Sequence'
      ? PathIcon
      : label === 'Occlusion'
        ? ImageIcon
        : label === 'Cloze'
          ? FileTextIcon
          : CardsIcon;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 text-ink-faint"
    >
      <Icon width={14} height={14} />
    </span>
  );
}
