import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReviewStore } from '../../store/review';
import { currentCard } from '../../lib/reviewSession';
import { type ReviewRating } from '../../lib/fsrs';
import { explainAnswer, LlmNotConfiguredError } from '../../lib/llm/service';
import { BasicCardFront } from '../cards/BasicCardFront';
import { BasicCardBack } from '../cards/BasicCardBack';
import { ClozeCardFront } from '../cards/ClozeCardFront';
import { ClozeCardBack } from '../cards/ClozeCardBack';
import { OcclusionCardFront } from '../cards/OcclusionCardFront';
import { OcclusionCardBack } from '../cards/OcclusionCardBack';
import { RatingButtons } from './RatingButtons';
import { UI } from '../../ui-strings';
import type { OcclusionData } from '../../types';
import styles from './ReviewCard.module.css';

const FLIP_DURATION = 0.125; // Each half of the flip: 125ms (250ms total)
const SLIDE_DURATION = 0.2;

const RATING_KEYS: Record<string, ReviewRating> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
};

export function ReviewCard() {
  const { session, flipped, flipCard, submitRating } = useReviewStore();
  const [explainVisible, setExplainVisible] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const current = session ? currentCard(session) : null;
  const isSequenceChain = current?.queueType === 'sequence_chain';

  const sequenceTotal = useMemo(() => {
    if (!session || !current || current.queueType !== 'sequence_chain')
      return 0;
    return session.queue.filter(
      (item) =>
        item.queueType === 'sequence_chain' && item.cardId === current.cardId,
    ).length;
  }, [session, current]);

  const answerPayload = useMemo(() => {
    if (!current) {
      return { front: '', back: '' };
    }

    if (current.queueType === 'sequence_chain') {
      return {
        front: current.prompt,
        back: current.answer,
      };
    }

    if (current.card.card_type === 'cloze') {
      const clozeText = current.card.cloze_text ?? '';
      return {
        front: clozeText,
        back: clozeText,
      };
    }

    return {
      front: current.card.front,
      back: current.card.back,
    };
  }, [current]);

  const currentIdentity =
    current?.queueType === 'card' ? current.card.id : current?.itemId;
  const currentActiveIndex =
    current?.queueType === 'card' ? current.activeIndex : undefined;
  const currentActiveRectId =
    current?.queueType === 'card' ? current.activeRectId : undefined;

  useEffect(() => {
    setExplainVisible(false);
    setExplanation('');
    setExplainError(null);
    setNotConfigured(false);
    setExplainLoading(false);
  }, [
    current?.queueType,
    currentIdentity,
    currentActiveIndex,
    currentActiveRectId,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent triggering when focus is on an input/textarea.
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === ' ' || e.key === 'Enter') {
        if (!flipped) {
          e.preventDefault();
          flipCard();
        }
        return;
      }

      if (flipped) {
        const rating = RATING_KEYS[e.key];
        if (rating) {
          void submitRating(rating);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flipped, flipCard, submitRating]);

  if (!current) return null;
  const cardItem = current.queueType === 'card' ? current : null;
  if (!isSequenceChain && !cardItem) return null;
  const card = cardItem?.card ?? null;

  const state = current.state;
  const activeIndex =
    current.queueType === 'card' ? current.activeIndex : undefined;
  const activeRectId =
    current.queueType === 'card' ? current.activeRectId : undefined;
  // Key on card id, activeIndex (cloze), and activeRectId (occlusion) so the
  // slide animation fires for each distinct review item.
  const slideKey =
    current.queueType === 'sequence_chain'
      ? `${current.cardId}-${current.itemId}`
      : `${cardItem?.card.id ?? ''}-${activeIndex ?? ''}-${activeRectId ?? ''}`;

  const occlusionData: OcclusionData = Array.isArray(card?.occlusion_data)
    ? (card.occlusion_data as OcclusionData)
    : [];

  const handleExplain = async () => {
    setExplainVisible(true);
    setExplainLoading(true);
    setExplanation('');
    setExplainError(null);
    setNotConfigured(false);

    try {
      await explainAnswer({
        front: answerPayload.front,
        back: answerPayload.back,
        noteContext:
          current.queueType === 'card' ? current.noteContext : undefined,
        onChunk: (chunk) => {
          setExplanation((prev) => `${prev}${chunk}`);
        },
      });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        setNotConfigured(true);
      } else {
        setExplainError(err instanceof Error ? err.message : UI.common.error);
      }
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Slide transition between cards (and between cloze/occlusion items) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideKey}
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ duration: SLIDE_DURATION, ease: 'easeInOut' }}
          className={styles.cardSlide}
        >
          <div className={styles.card} style={{ perspective: '1000px' }}>
            {/* Flip transition between front and back */}
            <AnimatePresence mode="wait">
              {!flipped ? (
                <motion.div
                  key="front"
                  className={styles.face}
                  initial={{ rotateY: 90 }}
                  animate={{ rotateY: 0 }}
                  exit={{ rotateY: -90 }}
                  transition={{ duration: FLIP_DURATION, ease: 'easeInOut' }}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className={styles.faceContent}>
                    {isSequenceChain ? (
                      <div className={styles.sequenceCardBody}>
                        <p className={styles.sequenceLabel}>
                          {UI.sequence.chainDrillLabel} —{' '}
                          {current.sequenceTitle}
                        </p>
                        <p className={styles.sequencePosition}>
                          {UI.sequence.itemPosition(
                            current.position,
                            Math.max(sequenceTotal, current.position),
                          )}
                        </p>
                        <p className={styles.cardText}>{current.prompt}</p>
                      </div>
                    ) : cardItem?.card.card_type === 'image_occlusion' ? (
                      <OcclusionCardFront
                        imageUrl={cardItem.card.image_url ?? ''}
                        occlusionData={occlusionData}
                        activeRectId={activeRectId ?? ''}
                        className={styles.cardText}
                      />
                    ) : cardItem?.card.card_type === 'cloze' ? (
                      <ClozeCardFront
                        clozeText={cardItem.card.cloze_text ?? ''}
                        activeIndex={activeIndex}
                        className={styles.cardText}
                      />
                    ) : (
                      <BasicCardFront
                        front={cardItem?.card.front ?? ''}
                        className={styles.cardText}
                      />
                    )}
                  </div>
                  <div className={styles.faceFooter}>
                    <button
                      type="button"
                      className={styles.flipButton}
                      onClick={flipCard}
                    >
                      {UI.review.showAnswer}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="back"
                  className={styles.face}
                  initial={{ rotateY: 90 }}
                  animate={{ rotateY: 0 }}
                  exit={{ rotateY: -90 }}
                  transition={{ duration: FLIP_DURATION, ease: 'easeInOut' }}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className={styles.faceContent}>
                    {isSequenceChain ? (
                      <div className={styles.sequenceCardBody}>
                        <p className={styles.sequenceLabel}>
                          {UI.sequence.chainDrillLabel} —{' '}
                          {current.sequenceTitle}
                        </p>
                        <p className={styles.sequencePosition}>
                          {UI.sequence.itemPosition(
                            current.position,
                            Math.max(sequenceTotal, current.position),
                          )}
                        </p>
                        <p className={styles.cardText}>{current.prompt}</p>
                        <hr className={styles.sequenceDivider} />
                        <p className={styles.cardText}>{current.answer}</p>
                      </div>
                    ) : cardItem?.card.card_type === 'image_occlusion' ? (
                      <OcclusionCardBack
                        imageUrl={cardItem.card.image_url ?? ''}
                        occlusionData={occlusionData}
                        activeRectId={activeRectId ?? ''}
                        className={styles.cardText}
                      />
                    ) : cardItem?.card.card_type === 'cloze' ? (
                      <ClozeCardBack
                        clozeText={cardItem.card.cloze_text ?? ''}
                        activeIndex={activeIndex}
                        className={styles.cardText}
                      />
                    ) : (
                      <BasicCardBack
                        back={cardItem?.card.back ?? ''}
                        className={styles.cardText}
                      />
                    )}
                  </div>
                  <div className={styles.faceFooter}>
                    <RatingButtons
                      state={state}
                      onRate={(r) => void submitRating(r)}
                    />
                  </div>

                  <div className={styles.llmRow}>
                    <button
                      type="button"
                      className={styles.explainButton}
                      onClick={() => void handleExplain()}
                      disabled={explainLoading}
                    >
                      {UI.llm.explain}
                    </button>
                  </div>

                  {explainVisible && (
                    <section className={styles.explainPanel}>
                      <div className={styles.explainHeader}>
                        <h3 className={styles.explainTitle}>
                          {UI.llm.explanation}
                        </h3>
                        <button
                          type="button"
                          className={styles.closeExplainButton}
                          onClick={() => setExplainVisible(false)}
                        >
                          {UI.llm.closeExplanation}
                        </button>
                      </div>

                      {notConfigured && (
                        <p className={styles.explainError}>
                          {UI.settings.llmNotConfiguredHint}{' '}
                          <Link to="/settings">{UI.settings.goToSettings}</Link>
                        </p>
                      )}

                      {explainError && (
                        <p className={styles.explainError}>{explainError}</p>
                      )}

                      {(explanation || explainLoading) && (
                        <p className={styles.explainBody}>
                          {explanation}
                          {explainLoading && (
                            <span className={styles.cursor}>|</span>
                          )}
                        </p>
                      )}
                    </section>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
