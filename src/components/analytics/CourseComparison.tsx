import { useMemo, useState } from 'react';
import { m as motion, AnimatePresence } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useChartColours } from './useChartColours';
import { ChartCard } from './ChartCard';
import type { Course, Card } from '../../db/types';
import {
  averagePredictedRetrievability,
  masteryFraction,
} from '../../fsrs/progress';
import { isLeech } from '../../fsrs/leech';
import { startOfDay } from '../../utils/datetime';

interface ComparisonMetric {
  label: string;
  courseA: number;
  courseB: number;
  unit?: string;
  higherIsBetter?: boolean;
}

function computeMetrics(
  courseA: Course,
  cardsA: Card[],
  courseB: Course,
  cardsB: Card[],
): ComparisonMetric[] {
  const avgRetA = averagePredictedRetrievability(cardsA, courseA);
  const avgRetB = averagePredictedRetrievability(cardsB, courseB);
  const masteryA = masteryFraction(cardsA, courseA);
  const masteryB = masteryFraction(cardsB, courseB);

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
    { label: 'Cards', courseA: cardsA.length, courseB: cardsB.length, higherIsBetter: true },
    {
      label: 'Predicted exam score',
      courseA: Math.round(avgRetA * 100),
      courseB: Math.round(avgRetB * 100),
      unit: '%',
      higherIsBetter: true,
    },
    {
      label: 'Mastery fraction',
      courseA: Math.round(masteryA * 100),
      courseB: Math.round(masteryB * 100),
      unit: '%',
      higherIsBetter: true,
    },
    { label: 'Cards reviewed', courseA: reviewedA, courseB: reviewedB, higherIsBetter: true },
    { label: 'Total reviews', courseA: totalReviewsA, courseB: totalReviewsB, higherIsBetter: true },
    { label: 'Reviews today', courseA: reviewsTodayA, courseB: reviewsTodayB, higherIsBetter: true },
    { label: 'Leech cards', courseA: leechesA, courseB: leechesB, higherIsBetter: false },
    {
      label: 'Mean stability',
      courseA: Number(avgStabilityA.toFixed(1)),
      courseB: Number(avgStabilityB.toFixed(1)),
      unit: ' days',
      higherIsBetter: true,
    },
    {
      label: 'Mean difficulty',
      courseA: Number(avgDifficultyA.toFixed(1)),
      courseB: Number(avgDifficultyB.toFixed(1)),
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
  const widthA = max > 0 ? (metric.courseA / max) * 100 : 0;
  const widthB = max > 0 ? (metric.courseB / max) * 100 : 0;
  const unit = metric.unit ?? '';
  const winner = metric.higherIsBetter
    ? metric.courseA > metric.courseB
      ? 'A'
      : metric.courseB > metric.courseA
        ? 'B'
        : null
    : metric.courseA < metric.courseB
      ? 'A'
      : metric.courseB < metric.courseA
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
            aria-label={winner === 'A' ? 'Course A leads' : 'Course B leads'}
          >
            {winner}
          </motion.span>
        )}
      </div>
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
            {metric.courseA}
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
            {metric.courseB}
            {unit}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export interface CourseComparisonProps {
  courses: Course[];
  cards: Card[];
}

/** Side-by-side statistics for two courses on the global analytics page. */
export function CourseComparison({ courses, cards }: CourseComparisonProps) {
  const [courseAId, setCourseAId] = useState<string>('');
  const [courseBId, setCourseBId] = useState<string>('');
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const c = useChartColours();

  const byCourse = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of cards) {
      if (!card.courseId) continue;
      const list = map.get(card.courseId) ?? [];
      list.push(card);
      map.set(card.courseId, list);
    }
    return map;
  }, [cards]);

  const courseA = courses.find((course) => course.id === courseAId);
  const courseB = courses.find((course) => course.id === courseBId);
  const cardsA = useMemo(() => byCourse.get(courseAId) ?? [], [byCourse, courseAId]);
  const cardsB = useMemo(() => byCourse.get(courseBId) ?? [], [byCourse, courseBId]);

  const metrics = useMemo(() => {
    if (!courseA || !courseB) return [];
    return computeMetrics(courseA, cardsA, courseB, cardsB);
  }, [courseA, courseB, cardsA, cardsB]);

  const maxByMetric = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of metrics) {
      map.set(metric.label, Math.max(metric.courseA, metric.courseB, 1));
    }
    return map;
  }, [metrics]);

  const colourA = courseA?.colour ?? c.accent;
  const colourB = courseB?.colour ?? c.positive;

  return (
    <ChartCard
      title="Course comparison"
      description="Select two courses to compare their statistics side by side."
      empty={courses.length < 2}
      emptyMessage="Create at least two courses to compare them."
      delay={0}
      className="h-auto"
      compactEmpty
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={courseAId}
            onChange={(e) => setCourseAId(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            aria-label="First course"
          >
            <option value="">Select a course…</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id} disabled={course.id === courseBId}>
                {course.name}
              </option>
            ))}
          </select>
          <span className="self-center text-sm text-ink-faint">vs</span>
          <select
            value={courseBId}
            onChange={(e) => setCourseBId(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            aria-label="Second course"
          >
            <option value="">Select a course…</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id} disabled={course.id === courseAId}>
                {course.name}
              </option>
            ))}
          </select>
        </div>

        <AnimatePresence mode="wait">
          {courseA && courseB && (
            <motion.div
              key={`${courseAId}-${courseBId}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 * m, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colourA }} />
                  <span className="text-ink">{courseA.name}</span>
                </div>
                <span className="text-ink-faint">vs</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colourB }} />
                  <span className="text-ink">{courseB.name}</span>
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
