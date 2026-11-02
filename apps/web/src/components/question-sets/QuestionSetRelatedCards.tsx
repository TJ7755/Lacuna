import { useId, useRef, useState } from 'react';
import type { Card } from '@lacuna/core/db/types';
import { CardContent } from '../cards/CardContent';
import { Button } from '../ui/Button';

/** Consultation stays on one card; changing cards never reveals the next answer. */
export function QuestionSetRelatedCards({
  cards,
  submitted,
  onClose,
}: {
  cards: Card[];
  submitted: boolean;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(cards[0]?.id);
  const index = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId),
  );
  const card = cards[index];
  const reader = useRef<HTMLDivElement>(null);
  if (!card) return null;
  function move(next: number) {
    setSelectedId(cards[next].id);
    reader.current?.scrollTo({ top: 0 });
  }
  return (
    <div className="qs-related-reader">
      <nav className="qs-related-navigation" aria-label="Related cards">
        <Button variant="ghost" disabled={index === 0} onClick={() => move(index - 1)}>
          Previous card
        </Button>
        <p className="qs-muted" role="status">
          Card {index + 1} of {cards.length}
        </p>
        <Button
          variant="ghost"
          disabled={index === cards.length - 1}
          onClick={() => move(index + 1)}
        >
          Next card
        </Button>
      </nav>
      <div className="qs-related-card" ref={reader}>
        <RelatedCard key={card.id} card={card} />
      </div>
      <Button variant="primary" onClick={onClose}>
        {submitted ? 'Return to marking' : 'Return to answer'}
      </Button>
    </div>
  );
}

function RelatedCard({ card }: { card: Card }) {
  const [revealed, setRevealed] = useState(false);
  const answerId = useId();
  return (
    <>
      <p className="qs-kicker">Question</p>
      <CardContent card={card} side="front" />
      <Button
        className="mt-4"
        aria-expanded={revealed}
        aria-controls={answerId}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? 'Hide answer' : 'Show answer'}
      </Button>
      <div id={answerId} hidden={!revealed} className="qs-related-answer">
        {revealed && (
          <>
            <p className="qs-kicker">Answer</p>
            <CardContent card={card} side="back" />
          </>
        )}
      </div>
    </>
  );
}
