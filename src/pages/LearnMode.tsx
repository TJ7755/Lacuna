import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { db } from '../db/schema';
import type { Card, Deck, Grade, UserPerformance } from '../db/types';
import { recordReview } from '../db/repository';
import { emptyPerformance, gradeFromResponse, updatePerformance } from '../fsrs/grading';
import {
  applyCooldown,
  decrementCooldowns,
  selectNextCard,
  type CooldownMap,
} from '../fsrs/cooldown';
import { masteryFraction } from '../fsrs/progress';
import { CardContent } from '../components/cards/CardContent';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Button } from '../components/ui/Button';
import { SessionReport } from '../components/learn/SessionReport';
import { useDistraction } from '../components/learn/useDistraction';
import type { SessionEvent, SessionSummary } from '../components/learn/types';
import { CheckIcon, CloseIcon } from '../components/ui/icons';

type Phase = 'loading' | 'question' | 'answer' | 'finished';

export function LearnMode() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const distraction = useDistraction();

  const [phase, setPhase] = useState<Phase>('loading');
  const [deck, setDeck] = useState<Deck | null>(null);
  const [current, setCurrent] = useState<Card | null>(null);
  const [mastery, setMastery] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  // Session-only mutable state held in refs so it never triggers re-renders mid-card,
  // and so the stable callbacks below always read the current values (no stale closures).
  const cooldowns = useRef<CooldownMap>(new Map());
  const perfRef = useRef<UserPerformance | null>(null);
  const timerStart = useRef(0);
  const responseTime = useRef(0);
  const events = useRef<SessionEvent[]>([]);
  const masteryBefore = useRef(0);
  const cardsRef = useRef<Card[]>([]);
  const deckRef = useRef<Deck | null>(null);
  // Guards against a double key-press / click submitting the same card twice while the
  // review is being persisted.
  const submitting = useRef(false);

  const backToDeck = useCallback(
    () => navigate(`/deck/${deckId}`),
    [navigate, deckId],
  );

  const finish = useCallback((reachedGoal: boolean) => {
    const currentDeck = deckRef.current;
    if (!currentDeck) return;
    const total = distraction.sessionMs();
    const focus =
      total <= 0
        ? 1
        : Math.max(0, Math.min(1, (total - distraction.blurredMs()) / total));
    setSummary({
      events: events.current,
      masteryBefore: masteryBefore.current,
      masteryAfter: masteryFraction(cardsRef.current, currentDeck),
      focusFraction: focus,
      reachedGoal,
    });
    setPhase('finished');
    // distraction reads internal refs, so a stable reference is safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Present the next eligible card, or finish if the goal has been reached. */
  const serveNext = useCallback(
    (pool: Card[]) => {
      const currentDeck = deckRef.current;
      if (!currentDeck) return;
      const next = selectNextCard(pool, currentDeck, cooldowns.current);
      if (!next) {
        finish(true);
        return;
      }
      setCurrent(next);
      setPhase('question');
      timerStart.current = performance.now();
      distraction.beginCard();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [finish],
  );

  // Initial load: read a static snapshot of the deck so the session is stable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deckId) return;
      const [loadedDeck, deckCards, perf] = await Promise.all([
        db.decks.get(deckId),
        db.cards.where('deckId').equals(deckId).toArray(),
        db.userPerformance.get(deckId),
      ]);
      if (cancelled) return;
      if (!loadedDeck || deckCards.length === 0) {
        navigate(`/deck/${deckId}`);
        return;
      }
      perfRef.current = perf ?? emptyPerformance(deckId);
      cardsRef.current = deckCards;
      deckRef.current = loadedDeck;
      masteryBefore.current = masteryFraction(deckCards, loadedDeck);
      setDeck(loadedDeck);
      setMastery(masteryBefore.current);

      if (masteryBefore.current >= 1) {
        // Already exam-ready: show the report straight away.
        setSummary({
          events: [],
          masteryBefore: masteryBefore.current,
          masteryAfter: masteryBefore.current,
          focusFraction: 1,
          reachedGoal: true,
        });
        setPhase('finished');
      } else {
        serveNext(deckCards);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, navigate, serveNext]);

  const reveal = useCallback(() => {
    if (phase !== 'question') return;
    responseTime.current = (performance.now() - timerStart.current) / 1000;
    setPhase('answer');
  }, [phase]);

  const answer = useCallback(
    async (correct: boolean) => {
      if (phase !== 'answer' || !current || !deck || submitting.current) return;
      submitting.current = true;
      const t = responseTime.current;
      const distracted = distraction.wasDistracted();
      const grade: Grade = gradeFromResponse(correct, t, perfRef.current ?? undefined);

      // Persist the review and update the in-session card snapshot.
      const updated = await recordReview({
        card: current,
        deck,
        grade,
        responseTimeSec: t,
        distracted,
        correct,
      });

      if (correct && perfRef.current) {
        perfRef.current = updatePerformance(perfRef.current, t);
      }

      const nextCards = cardsRef.current.map((c) =>
        c.id === updated.id ? updated : c,
      );
      cardsRef.current = nextCards;

      // Cooldown bookkeeping: failed cards wait; every other card's cooldown decays.
      if (grade === 1) applyCooldown(cooldowns.current, updated.id, nextCards.length);
      decrementCooldowns(cooldowns.current, updated.id);

      events.current = [...events.current, { grade, correct, responseTimeSec: t, distracted }];

      const newMastery = masteryFraction(nextCards, deck);
      setMastery(newMastery);

      if (newMastery >= 1) finish(true);
      else serveNext(nextCards);
      submitting.current = false;
    },
    [phase, current, deck, distraction, finish, serveNext],
  );

  // Keyboard shortcuts:
  //   question phase - Space or Up arrow reveals the answer.
  //   answer phase   - Y/J or Right arrow = correct; N/F or Left arrow = incorrect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (phase === 'question' && (e.code === 'Space' || e.code === 'ArrowUp')) {
        e.preventDefault();
        reveal();
      } else if (phase === 'answer') {
        const k = e.key.toLowerCase();
        if (k === 'y' || k === 'j' || e.code === 'ArrowRight') answer(true);
        else if (k === 'n' || k === 'f' || e.code === 'ArrowLeft') answer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, reveal, answer]);

  if (phase === 'loading' || !deck) {
    return (
      <div className="grid h-screen place-items-center text-ink-faint">
        <span className="animate-pulse font-display text-2xl">Preparing session…</span>
      </div>
    );
  }

  if (phase === 'finished' && summary) {
    return (
      <div className="min-h-screen">
        <SessionReport
          summary={summary}
          onReturn={backToDeck}
          onContinue={
            summary.reachedGoal
              ? undefined
              : () => {
                  events.current = [];
                  masteryBefore.current = masteryFraction(cardsRef.current, deck);
                  setSummary(null);
                  serveNext(cardsRef.current);
                }
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Top bar: progress + exit */}
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
              <span className="truncate font-medium uppercase tracking-[0.14em]">
                {deck.name}
              </span>
              <span className="tabular">{Math.round(mastery * 100)}% exam-ready</span>
            </div>
            <ProgressBar value={mastery} height={6} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => finish(false)}>
            Exit
          </Button>
        </div>
      </header>

      {/* Card */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        {current && (
          <FlipCard card={current} revealed={phase === 'answer'} />
        )}

        {/* Controls */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            {phase === 'question' ? (
              <motion.div
                key="show"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-2"
              >
                <Button variant="primary" size="lg" className="w-full max-w-sm" onClick={reveal}>
                  Show answer
                </Button>
                <span className="text-xs text-ink-faint">Press Space or Up</span>
              </motion.div>
            ) : (
              <motion.div
                key="grade"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="flex w-full max-w-md gap-3">
                  <Button
                    variant="danger"
                    size="lg"
                    className="flex-1"
                    onClick={() => answer(false)}
                  >
                    <CloseIcon width={18} height={18} />
                    No
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    onClick={() => answer(true)}
                  >
                    <CheckIcon width={18} height={18} />
                    Yes
                  </Button>
                </div>
                <span className="text-xs text-ink-faint">
                  Yes: Y or Right · No: N or Left
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

/**
 * A card that flips vertically to reveal its answer. The two faces are swapped via a
 * keyed transition (rather than absolute stacking) so the card's height always fits the
 * content, even when the answer is much longer than the question.
 */
function FlipCard({ card, revealed }: { card: Card; revealed: boolean }) {
  const isCloze = card.type === 'cloze';
  return (
    <div
      className="flex flex-1 items-center justify-center"
      style={{ perspective: 1600 }}
    >
      <div className="w-full" style={{ transformStyle: 'preserve-3d' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={revealed ? 'back' : 'front'}
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 90, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'center top' }}
            className={
              'rounded-3xl border bg-surface px-8 py-12 shadow-xl shadow-black/5 ' +
              (revealed ? 'border-accent/40' : 'border-line')
            }
          >
            <div
              className={
                'mb-4 text-center text-[11px] uppercase tracking-[0.2em] ' +
                (revealed ? 'text-accent' : 'text-ink-faint')
              }
            >
              {revealed ? 'Answer' : isCloze ? 'Fill the gap' : 'Question'}
            </div>
            <div className="mx-auto max-w-prose text-center text-lg">
              <CardContent card={card} side={revealed ? 'back' : 'front'} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
