import { m as motion } from 'motion/react';
import type { Card, Occlusion } from '../../db/types';
import { CardContent } from '../../components/cards/CardContent';
import { LineHintButton, LineHintDisplay } from '../../components/learn/LineHint';
import { HINT_TIME_PENALTY_SEC } from '../../fsrs/grading';
import { answerComparisonOptions, type AnswerStrictness } from '../../state/answerStrictness';
import { compareAnswer } from '../../utils/answerComparison';
import { typingExpectedAnswer } from './sessionCardCapabilities';

export function StudyCardFace({
  card,
  side,
  audioCard,
  audioAutoplay,
  isLinesModeCard,
  hintStep,
  hintAffectsScheduling,
  isTyping,
  typedAnswer,
  answerStrictness,
  occlusion,
  occlusionAnswerText,
  motionMultiplier,
  measuring = false,
  onReplayAudio,
  onRevealHint,
}: {
  card: Card;
  side: 'front' | 'back';
  audioCard: boolean;
  audioAutoplay: boolean;
  isLinesModeCard?: boolean;
  hintStep?: 0 | 1 | 2;
  hintAffectsScheduling?: boolean;
  isTyping: boolean;
  typedAnswer?: string;
  answerStrictness: AnswerStrictness;
  occlusion?: Occlusion;
  occlusionAnswerText?: string;
  motionMultiplier: number;
  measuring?: boolean;
  onReplayAudio: () => void;
  onRevealHint: () => void;
}) {
  const comparison =
    side === 'back' && isTyping && typedAnswer !== undefined
      ? compareAnswer(
          typedAnswer,
          typingExpectedAnswer(card, occlusionAnswerText),
          answerComparisonOptions(answerStrictness),
        )
      : null;

  return (
    <>
      <div
        data-study-face={measuring ? undefined : side}
        className={
          'mx-auto flex w-full max-w-prose flex-col justify-center text-center text-lg leading-relaxed md:text-xl' +
          (measuring ? '' : ' flex-1')
        }
      >
        <CardContent
          card={card}
          side={side}
          audioAutoplay={!measuring && audioAutoplay}
          sequenceCue
          sequenceMode={isLinesModeCard ? 'lines' : 'list'}
          occlusion={occlusion}
        />
      </div>
      {audioCard &&
        side === 'back' &&
        (measuring ? (
          <div className="mt-6 min-h-11 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft">
            Hear it again <span className="ml-1 text-xs text-ink-faint">R</span>
          </div>
        ) : (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onReplayAudio();
            }}
            className="mt-6 min-h-11 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            Hear it again <span className="ml-1 text-xs text-ink-faint">R</span>
          </button>
        ))}
      {isLinesModeCard && side === 'front' && (
        <div
          onPointerDown={measuring ? undefined : (event) => event.stopPropagation()}
          onPointerUp={measuring ? undefined : (event) => event.stopPropagation()}
          onClick={measuring ? undefined : (event) => event.stopPropagation()}
          onKeyDown={measuring ? undefined : (event) => event.stopPropagation()}
        >
          {(hintStep ?? 0) > 0 && (
            <>
              <LineHintDisplay
                answer={typingExpectedAnswer(card)}
                step={hintStep as 1 | 2}
                m={motionMultiplier}
              />
              {hintAffectsScheduling && (
                <p className="mx-auto mt-2 max-w-prose text-center text-xs text-ink-faint">
                  Hints add {HINT_TIME_PENALTY_SEC} seconds to the response time used for silent
                  grading.
                </p>
              )}
            </>
          )}
          {(hintStep ?? 0) < 2 && (
            <LineHintButton step={(hintStep ?? 0) as 0 | 1} onReveal={onRevealHint} />
          )}
        </div>
      )}
      {comparison && (
        <motion.div
          initial={measuring ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            measuring
              ? { duration: 0 }
              : {
                  duration: 0.2 * motionMultiplier,
                  delay: 0.2 * motionMultiplier,
                  ease: [0.16, 1, 0.3, 1],
                }
          }
          className="mx-auto mt-6 max-w-prose border-t border-line pt-6 text-center"
        >
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Your answer
          </div>
          <div className="mb-4 text-lg text-ink">
            {typedAnswer?.trim() || <span className="italic text-ink-faint">(empty)</span>}
          </div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-accent">
            Correct answer
          </div>
          <div className="text-lg">
            {comparison.words.map((word, index) => (
              <span
                key={index}
                className={
                  word.matched ? 'text-positive' : 'text-negative underline decoration-negative/50'
                }
              >
                {word.text}
                {index < comparison.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </>
  );
}
