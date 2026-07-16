import { memo } from 'react';
import { MarkdownView } from '../markdown/MarkdownView';
import { isLabelCardId, parseSequenceFront } from '../../db/sequenceGeneration';
import type { Card } from '../../db/types';

type Side = 'front' | 'back';

/**
 * Render one side of a card, handling all card types:
 *  - front_back: the front or back Markdown directly.
 *  - cloze: the same source, shown with blanks (front) or revealed answers (back).
 *  - basic_reversed: same as front_back — the primary card's front/back are rendered.
 *
 * Memoised so a parent re-render (e.g. toggling select mode in the card list) doesn't
 * touch every card's markdown; it re-renders only when this card's content changes.
 */
export const CardContent = memo(function CardContent({
  card,
  side,
  className,
  sequenceCue = false,
  sequenceMode = 'list',
}: {
  card: Card;
  side: Side;
  className?: string;
  /**
   * When true, a sequence-generated positional card's front is split into its
   * header/cue items (per `parseSequenceFront`), styled as muted context above a
   * prominent "recall the next item" prompt, instead of the plain Markdown front.
   * Label cards (`isLabelCardId`) and every other card type are unaffected either way.
   *
   * Only meaningful for a full study-card presentation (learn mode). Surfaces that
   * show a card's front verbatim — the read-only editor view, or a truncated list
   * preview — should leave this off so they keep rendering the stored Markdown as-is.
   */
  sequenceCue?: boolean;
  /** The owning sequence's mode, used to choose item- or line-specific recall wording. */
  sequenceMode?: 'list' | 'lines';
}) {
  if (card.type === 'cloze') {
    return (
      <MarkdownView
        source={card.front}
        clozeMode={side === 'front' ? 'front' : 'back'}
        className={className}
      />
    );
  }

  if (sequenceCue && side === 'front' && card.sequenceItemId !== undefined && !isLabelCardId(card.sequenceItemId)) {
    const { header, body } = parseSequenceFront(card.front);
    const headerText = header.replace(/^\*\*/, '').replace(/\*\*$/, '');
    const isLinesMode = sequenceMode === 'lines' || body === 'First line?';
    const firstPrompt = isLinesMode ? 'First line?' : 'First item?';
    const nextPrompt = isLinesMode ? 'Next line?' : 'Next item?';
    const isFirst = body === firstPrompt;
    const cueParagraphs = isFirst ? [] : body.split('\n\n');
    return (
      <div className={className}>
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ink-faint">{headerText}</div>
        {cueParagraphs.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 text-ink-soft">
            {cueParagraphs.map((paragraph, i) => (
              <MarkdownView key={i} source={paragraph} />
            ))}
          </div>
        )}
        <div className="text-ink">{isFirst ? firstPrompt : nextPrompt}</div>
      </div>
    );
  }

  // basic_reversed and front_back both render the same way: front or back.
  return <MarkdownView source={side === 'front' ? card.front : card.back} className={className} />;
});
