import { useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { CardContent } from '../cards/CardContent';
import { StepSwap } from '../ui/StepSwap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { canReverseImportCard } from '../../db/cardImport';
import type { ParsedCard } from '../../db/import';

function PreviewFace({ card, reverse }: { card: ParsedCard; reverse: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const face = {
    ...card,
    id: 'import-preview',
    front: reverse ? card.back : card.front,
    back: reverse ? card.front : card.back,
  };
  return (
    <div className="card-import-preview-card">
      <div className="card-import-face-label">
        <span>{reverse ? 'Reverse' : 'Original'}</span>
        <span>{revealed ? 'Answer' : 'Front'}</span>
      </div>
      <div className="card-import-face" data-revealed={revealed}>
        <AnimatePresence initial={false}>
          <motion.div
            key={revealed ? 'back' : 'front'}
            className="card-import-face-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: m ? 0.18 * m : 0 }}
          >
            <CardContent
              card={face}
              side={revealed ? 'back' : 'front'}
              className="w-full text-center text-lg leading-relaxed md:text-xl"
            />
          </motion.div>
        </AnimatePresence>
      </div>
      <button className="card-import-reveal" type="button" onClick={() => setRevealed(!revealed)}>
        {revealed ? 'Hide answer' : 'Show answer'}
      </button>
    </div>
  );
}

export function CardImportPreview({ cards, reverse }: { cards: ParsedCard[]; reverse: boolean }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const currentIndex = Math.min(index, cards.length - 1);
  const card = cards[currentIndex];
  if (!card) return null;
  return (
    <div className="card-import-preview">
      <StepSwap stepKey={String(currentIndex)} direction={direction}>
        <div className="card-import-pair">
          <PreviewFace card={card} reverse={false} />
          {reverse && canReverseImportCard(card) && <PreviewFace card={card} reverse />}
        </div>
      </StepSwap>
      <div className="card-import-pagination">
        <button
          type="button"
          aria-label="Previous card"
          disabled={currentIndex <= 0}
          onClick={() => {
            setDirection(-1);
            setIndex(currentIndex - 1);
          }}
        >
          ←
        </button>
        <span aria-live="polite">
          {currentIndex + 1} / {cards.length}
        </span>
        <button
          type="button"
          aria-label="Next card"
          disabled={currentIndex >= cards.length - 1}
          onClick={() => {
            setDirection(1);
            setIndex(currentIndex + 1);
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
