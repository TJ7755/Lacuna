import { useMemo, useState } from 'react';
import { m as motion, AnimatePresence } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useChartColours } from './useChartColours';
import { ChartCard } from './ChartCard';
import type { Deck, Card } from '../../db/types';
import {
  averagePredictedRetrievability,
  masteryFraction,
} from '../../fsrs/progress';
import { isLeech } from '../../fsrs/leech';
import { startOfDay } from '../../utils/datetime';

interface ComparisonMetric {
  label: string;
  deckA: number;
  deckB: number;
  unit?: string;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
}

function computeMetrics(
  deckA: Deck,
  cardsA: Card[],
  deckB: Deck,
  cardsB: Card[],
): ComparisonMetric[] {
  const avgRetA = averagePredictedRetrievability(cardsA, deckA);
  const avgRetB = averagePredictedRetrievability(cardsB, deckB);
  const masteryA = masteryFraction(cardsA, deckA);
  const masteryB = masteryFraction(cardsB, deckB);

  const reviewedA = cardsA.filter((c) => c.history.length > 0).length;
  const reviewedB = cardsB.filter((c) => c.history.length > 0).length;

  const totalReviewsA = cardsA.reduce((s, c) => s + c.history.length, 0);
  const totalReviewsB = cardsB.reduce((s, c) => s + c.history.length, 0);

  const leechesA = cardsA.filter(isLeech).length;
  const leechesB = cardsB.filter(isLeech).length;

  const avgStabilityA =
    cardsA.length > 0
      ? cardsA.reduce((s, c) => s + (c.stability ?? 0), 0) / cardsA.length
      : 0;
  const avgStabilityB =
    cardsB.length > 0
      ? cardsB.reduce((s, c) => s + (c.stability ?? 0), 0) / cardsB.length
      : 0;

  const avgDifficultyA =
    cardsA.length > 0
      ? cardsA.reduce((s, c) => s + (c.difficulty ?? 5), 0) / cardsA.length
      : 0;
  const avgDifficultyB =
    cardsB.length > 0
      ? cardsB.reduce((s, c) => s + (c.difficulty ?? 5), 0) / cardsB.length
      : 0;

  const today = startOfDay(Date.now());
  const reviewsTodayA = cardsA.reduce(
    (s, c) => s + c.history.filter((h) => startOfDay(h.timestamp) === today).length,
    0,
  );
  const reviewsTodayB = cardsB.reduce(
    (s, c) => s + c.history.filter((h) => startOfDay(h.timestamp) === today).length,
    0,
  );

  return [
    {
      label: 'Cards',
      deckA: cardsA.length,
      deckB: cardsB.length,
      higherIsBetter: true,
    },
    {
      label: 'Predicted exam score',
      deckA: Math.round(avgRetA * 100),
      deckB: Math.round(avgRetB * 100),
      unit: '%',
      higherIsBetter: true,
    },
    {
      label: 'Mastery fraction',
      deckA: Math.round(masteryA * 100),
      deckB: Math.round(masteryB * 100),
      unit: '%',
      higherIsBetter: true,
    },
    {
      label: 'Cards reviewed',
      deckA: reviewedA,
      deckB: reviewedB,
      higherIsBetter: true,
    },
    {
      label: 'Total reviews',
      deckA: totalReviewsA,
      deckB: totalReviewsB,
      higherIsBetter: true,
    },
    {
      label: 'Reviews today',
      deckA: reviewsTodayA,
      deckB: reviewsTodayB,
      higherIsBetter: true,
    },
    {
      label: 'Leech cards',
      deckA: leechesA,
      deckB: leechesB,
      higherIsBetter: false,
    },
    {
      label: 'Mean stability',
      deckA: Number(avgStabilityA.toFixed(1)),
      deckB: Number(avgStabilityB.toFixed(1)),
      unit: ' days',
      higherIsBetter: true,
    },
    {
      label: 'Mean difficulty',
      deckA: Number(avgDifficultyA.toFixed(1)),
      deckB: Number(avgDifficultyB.toFixed(1)),
      higherIsBetter: false,
    },
  ];
}

function ComparisonBar({
  metric,
  max,
  colourA,
  colourB,
  delay,
  m,
}: {
  metric: ComparisonMetric;
  max: number;
  colourA: string;
  colourB: string;
  delay: number;
  m: number;
}) {
  const widthA = max > 0 ? (metric.deckA / max) * 100 : 0;
  const widthB = max > 0 ? (metric.deckB / max) * 100 : 0;
  const unit = metric.unit ?? '';
  const winner = metric.higherIsBetter
    ? metric.deckA > metric.deckB
      ? 'A'
      : metric.deckB > metric.deckA
        ? 'B'
        : null
    : metric.deckA < metric.deckB
      ? 'A'
      : metric.deckB < metric.deckA
        ? 'B'
        : null;
  const winnerColour = winner === 'A' ? colourA : winner === 'B' ? colourB : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 * m, delay: delay * m, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{metric.label}</span>
        {winnerColour && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 * m, delay: (delay + 0.35) * m, type: 'spring', stiffness: 500, damping: 25 }}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
            style={{ backgroundColor: winnerColour }}
            aria-label={winner === 'A' ? 'Lesson A leads' : 'Lesson B leads'}
          >
            {winner}
          </motion.span>
        )}
      </div>
      {/* Stacked bars: each deck gets its own row so values never overlap. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colourA }} />
          <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${widthA}%` }}
              transition={{ duration: 0.6 * m, delay: (delay + 0.05) * m, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full"
              style={{ backgroundColor: colourA }}
            />
          </div>
          <span className="w-14 shrink-0 text-right tabular text-sm" style={{ color: colourA }}>
            {metric.deckA}
            {unit}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colourB }} />
          <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${widthB}%` }}
              transition={{ duration: 0.6 * m, delay: (delay + 0.1) * m, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full"
              style={{ backgroundColor: colourB }}
            />
          </div>
          <span className="w-14 shrink-0 text-right tabular text-sm" style={{ color: colourB }}>
            {metric.deckB}
            {unit}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface DeckComparisonProps {
  decks: Deck[];
  cards: Card[];
}

export function DeckComparison({ decks, cards }: DeckComparisonProps) {
  const [deckAId, setDeckAId] = useState<string>('');
  const [deckBId, setDeckBId] = useState<string>('');
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const c = useChartColours();

  const byDeck = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of cards) {
      const list = map.get(card.deckId) ?? [];
      list.push(card);
      map.set(card.deckId, list);
    }
    return map;
  }, [cards]);

  const deckA = decks.find((d) => d.id === deckAId);
  const deckB = decks.find((d) => d.id === deckBId);
  const cardsA = useMemo(() => byDeck.get(deckAId) ?? [], [byDeck, deckAId]);
  const cardsB = useMemo(() => byDeck.get(deckBId) ?? [], [byDeck, deckBId]);

  const metrics = useMemo(() => {
    if (!deckA || !deckB) return [];
    return computeMetrics(deckA, cardsA, deckB, cardsB);
  }, [deckA, deckB, cardsA, cardsB]);

  const maxByMetric = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of metrics) {
      map.set(metric.label, Math.max(metric.deckA, metric.deckB, 1));
    }
    return map;
  }, [metrics]);

  const colourA = deckA?.colour ?? c.accent;
  const colourB = deckB?.colour ?? c.positive;

  return (
    <ChartCard
      title="Lesson comparison"
      description="Select two lessons to compare their statistics side by side."
      empty={decks.length < 2}
      emptyMessage="Create at least two lessons to compare them."
      delay={0}
      className="h-auto"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={deckAId}
            onChange={(e) => setDeckAId(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            aria-label="First lesson"
          >
            <option value="">Select a lesson…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === deckBId}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="self-center text-sm text-ink-faint">vs</span>
          <select
            value={deckBId}
            onChange={(e) => setDeckBId(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            aria-label="Second lesson"
          >
            <option value="">Select a lesson…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === deckAId}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <AnimatePresence mode="wait">
          {deckA && deckB && (
            <motion.div
              key={`${deckAId}-${deckBId}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 * m, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colourA }} />
                  <span className="text-ink">{deckA.name}</span>
                </div>
                <span className="text-ink-faint">vs</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colourB }} />
                  <span className="text-ink">{deckB.name}</span>
                </div>
              </div>

              <div className="space-y-4">
                {metrics.map((metric, i) => (
                  <ComparisonBar
                    key={metric.label}
                    metric={metric}
                    max={maxByMetric.get(metric.label) ?? 1}
                    colourA={colourA}
                    colourB={colourB}
                    delay={i * 0.04}
                    m={m}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ChartCard>
  );
}
