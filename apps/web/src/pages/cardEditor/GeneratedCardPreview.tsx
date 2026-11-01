import { useNavigate } from 'react-router-dom';
import { COURSE_PAGE_FRAME } from '../../components/course/coursePageLayout';
import { AppLink as Link } from '../../components/ui/AppLink';
import { Button } from '../../components/ui/Button';
import { ChevronLeftIcon } from '../../components/ui/icons';
import { CardContent } from '../../components/cards/CardContent';
import { GeneratedCardBadge } from '../../components/cards/GeneratedCardBadge';
import { sequenceForItemId } from '../../db/sequenceGeneration';
import { occlusionForRegionId } from '../../db/occlusionGeneration';
import type { Card, Sequence, Occlusion } from '@lacuna/core/db/types';
import type { ReturnTarget } from '../../utils/editorOrigin';

const CARD_SURFACE = 'card-surface';

export function GeneratedCardPreview({
  card,
  sequences,
  occlusions,
  courseId,
  returnTo,
}: {
  card: Card;
  sequences: Sequence[] | undefined;
  occlusions: Occlusion[] | undefined;
  courseId: string | undefined;
  returnTo: ReturnTarget;
}) {
  const navigate = useNavigate();
  const backLabel = returnTo.label;
  const isSequenceGenerated = card.sequenceItemId !== null && card.sequenceItemId !== undefined;
  const isOcclusionGenerated =
    card.occlusionRegionId !== null && card.occlusionRegionId !== undefined;
  const owningSequence =
    isSequenceGenerated && sequences
      ? sequenceForItemId(sequences, card!.sequenceItemId!)
      : undefined;
  const owningOcclusion =
    isOcclusionGenerated && occlusions
      ? occlusionForRegionId(occlusions, card!.occlusionRegionId!)
      : undefined;
  const editHref = owningSequence
    ? `/course/${courseId}/sequence/${owningSequence.id}/edit`
    : owningOcclusion
      ? `/course/${courseId}/occlusion/${owningOcclusion.id}/edit`
      : undefined;
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-10 pt-8`}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            {...returnTo.linkProps}
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <ChevronLeftIcon width={14} height={14} />
            {backLabel ?? 'Back'}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-tight md:text-[44px]">
              Card
            </h1>
            <GeneratedCardBadge kind={isSequenceGenerated ? 'sequence' : 'occlusion'} />
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
          <span className="text-sm text-accent-ink">
            This card is generated from{' '}
            {owningSequence
              ? `the sequence “${owningSequence.name}”`
              : owningOcclusion
                ? `the occlusion “${owningOcclusion.name}”`
                : isSequenceGenerated
                  ? 'a sequence'
                  : 'an occlusion'}
            . Edit its {isSequenceGenerated ? 'content, order or cue window' : 'regions'} there —
            changes here would be lost the next time it regenerates.
          </span>
          {editHref && (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => navigate(editHref)}
            >
              {isSequenceGenerated ? 'Edit sequence' : 'Edit occlusion'}
            </Button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className={`rounded-3xl bg-surface p-7 ${CARD_SURFACE}`}>
            <h2 className="mb-3 font-display text-lg tracking-tight">Front</h2>
            <div className="text-ink-soft">
              <CardContent card={card} side="front" />
            </div>
          </div>
          <div className={`rounded-3xl bg-surface p-7 ${CARD_SURFACE}`}>
            <h2 className="mb-3 font-display text-lg tracking-tight">Back</h2>
            <div className="text-ink">
              <CardContent card={card} side="back" />
            </div>
          </div>
        </div>
        {(card.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(card.tags ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full bg-ink/[0.06] px-3 py-1 text-[13px] text-ink-soft"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
