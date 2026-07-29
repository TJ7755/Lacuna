import type { Card } from '../../db/types';
import { CardContent } from '../cards/CardContent';

interface UnknownItemFaceProps {
  card: Card;
}

/**
 * Read-only fallback for a card whose `payload` this client cannot render as a
 * study face — an unrecognised `v` or a known-but-unbuilt `kind` (e.g. `scaffold`,
 * reserved but not built in Arc 11 slice 1). Shows the `front` fallback the
 * payload doubles as (next_plan.md §11.2 rule 1) plus a plain notice, and takes
 * no `onAnswer` callback at all — the absence of a grading path, not merely
 * hidden controls, is what guarantees this item is never mis-marked (§11.2
 * rule 3). The student's escape hatch is the existing bury/suspend actions in
 * the card menu, not a bespoke skip control here.
 */
export function UnknownItemFace({ card }: UnknownItemFaceProps) {
  return (
    <section className="flex min-h-[22rem] flex-col justify-center rounded-3xl border border-line bg-surface px-6 py-10 shadow-xl shadow-black/5 md:min-h-[29rem] md:px-12 md:py-14">
      <div className="mx-auto w-full max-w-prose text-center text-lg leading-relaxed md:text-xl">
        <CardContent card={card} side="front" />
      </div>
      <div className="mx-auto mt-10 w-full max-w-2xl border-t border-line pt-8 text-center text-sm text-ink-faint">
        This item uses a newer format this version of Lacuna doesn’t understand yet.
        Update Lacuna to study it.
      </div>
    </section>
  );
}
