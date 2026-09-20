import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useMemo } from 'react';
import { m as motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAllCards, useAllReviewHistory, useAllSessionHistory } from '../state/useData';
import { useCourses } from '../state/useCourseData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { ChartCard } from '../components/analytics/ChartCard';
import { FadeInView } from '../components/ui/FadeInView';
import { useChartColours } from '../components/analytics/useChartColours';
import {
  forecastSeries,
  studyTimeSeries,
  retentionByAge,
  leechCountByCourse,
  reviewVolume,
  stabilityProfile,
  globalTrajectorySeries,
} from '../components/analytics/prepare';
import { predictionAccuracySeries } from '../fsrs/calibration';
import { CourseComparison } from '../components/analytics/CourseComparison';

function AnalyticsSkeleton() {
  return (
    <div className="space-y-2 p-6">
      <div className="py-4">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-ink/5" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4">
              <div className="h-7 w-32 animate-pulse rounded-lg bg-ink/5" />
            </div>
            <div className="h-56 animate-pulse rounded-lg bg-ink/5" />
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4">
              <div className="h-7 w-36 animate-pulse rounded-lg bg-ink/5" />
            </div>
            <div className="h-56 animate-pulse rounded-lg bg-ink/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Analytics() {
  const [motionSpeed] = useMotionSpeed();
  const motionMult = speedMultiplier(motionSpeed);
  const courses = useCourses();
  const allCards = useAllCards();
  const reviewHistory = useAllReviewHistory();
  const history = useAllSessionHistory();
  const c = useChartColours();

  const activeCourses = useMemo(
    () => (courses ?? []).filter((course) => !course.archived),
    [courses],
  );

  const activeCourseIds = useMemo(
    () => new Set(activeCourses.map((course) => course.id)),
    [activeCourses],
  );

  const courseMap = useMemo(
    () => new Map(activeCourses.map((course) => [course.id, course.name])),
    [activeCourses],
  );

  const cards = useMemo(
    () =>
      (allCards ?? []).filter(
        (card) =>
          card.courseId !== null &&
          card.courseId !== undefined &&
          activeCourseIds.has(card.courseId),
      ),
    [allCards, activeCourseIds],
  );

  const courseHistory = useMemo(
    () =>
      (history ?? []).filter(
        (entry) =>
          entry.courseId !== null &&
          entry.courseId !== undefined &&
          activeCourseIds.has(entry.courseId),
      ),
    [history, activeCourseIds],
  );

  const activeReviewHistory = useMemo(
    () =>
      (reviewHistory ?? []).filter(
        (entry) =>
          entry.courseId !== null &&
          entry.courseId !== undefined &&
          activeCourseIds.has(entry.courseId),
      ),
    [reviewHistory, activeCourseIds],
  );

  const forecast = useMemo(() => forecastSeries(cards), [cards]);
  const studyTime = useMemo(
    () => studyTimeSeries(cards, 30, Date.now(), activeReviewHistory),
    [cards, activeReviewHistory],
  );
  const volume = useMemo(
    () => reviewVolume(cards, 30, Date.now(), activeReviewHistory),
    [cards, activeReviewHistory],
  );
  const retention = useMemo(
    () => retentionByAge(cards, Date.now(), activeReviewHistory),
    [cards, activeReviewHistory],
  );
  const leeches = useMemo(() => leechCountByCourse(cards, courseMap), [cards, courseMap]);
  const profile = useMemo(() => stabilityProfile(cards), [cards]);
  const prediction = useMemo(
    () => predictionAccuracySeries(cards, activeReviewHistory),
    [cards, activeReviewHistory],
  );
  const trajectory = useMemo(() => globalTrajectorySeries(courseHistory), [courseHistory]);

  const hasReviews = useMemo(() => activeReviewHistory.length > 0, [activeReviewHistory]);

  const axisProps = {
    stroke: c.inkFaint,
    tick: { fill: c.inkFaint, fontSize: 11 },
    tickLine: false,
  };

  const tooltipStyle = {
    background: c.surface,
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    color: c.ink,
    fontSize: 13,
  } as const;

  if (
    courses === undefined ||
    allCards === undefined ||
    reviewHistory === undefined ||
    history === undefined
  ) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading analytics">
        <DelayedFallback>
          <AnalyticsSkeleton />
        </DelayedFallback>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 * motionMult, ease: [0.25, 0.1, 0.25, 1] }}
        className="py-4"
      >
        <h1 className="font-display text-3xl tracking-tight">Analytics</h1>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-2">
        <FadeInView className="lg:col-span-2" delay={0} y={0}>
          <CourseComparison
            courses={activeCourses}
            cards={cards}
            reviewHistory={activeReviewHistory}
          />
        </FadeInView>

        <FadeInView className="lg:col-span-2" delay={0.04} y={0}>
          <ChartCard
            title="Forecast"
            emptyDrawing="prediction"
            empty={cards.length === 0}
            emptyMessage="Add cards to forecast reviews."
            delay={0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="dueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="newFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.positive} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.positive} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} width={40} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: c.line }} />
                <Area
                  type="monotone"
                  dataKey="due"
                  isAnimationActive={false}
                  stackId="1"
                  stroke={c.accent}
                  strokeWidth={2}
                  fill="url(#dueFill)"
                />
                <Area
                  type="monotone"
                  dataKey="newCards"
                  isAnimationActive={false}
                  stackId="1"
                  stroke={c.positive}
                  strokeWidth={2}
                  fill="url(#newFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.06} y={0}>
          <ChartCard
            title="Predicted exam-day score"
            emptyDrawing="prediction"
            empty={trajectory.length < 2}
            emptyMessage="Complete reviews to plot a trajectory."
            delay={0.06}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trajectory} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="trajFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps} width={44} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v}%`, 'Predicted']}
                  cursor={{ stroke: c.line }}
                />
                <Area
                  type="monotone"
                  dataKey="retrievability"
                  isAnimationActive={false}
                  stroke={c.accent}
                  strokeWidth={2}
                  fill="url(#trajFill)"
                  dot={{ r: 2.5, fill: c.accent, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.12} y={0}>
          <ChartCard
            title="Prediction accuracy"
            emptyDrawing="accuracy"
            description="Brier score · lower is better"
            empty={prediction.length === 0}
            emptyMessage="Complete reviews to measure accuracy."
            delay={0.12}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prediction} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={8} />
                <YAxis yAxisId="score" domain={[0, 1]} {...axisProps} width={40} />
                <YAxis yAxisId="recall" orientation="right" domain={[0, 1]} hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ stroke: c.line }}
                  formatter={(v, name) => {
                    const value = typeof v === 'number' ? v : Number(v ?? 0);
                    if (name === 'brier') return [value.toFixed(3), 'Brier score'];
                    return [
                      `${Math.round(value * 100)}%`,
                      name === 'predicted' ? 'Predicted' : 'Actual',
                    ];
                  }}
                />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="brier"
                  isAnimationActive={false}
                  stroke={c.accent}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: c.accent, strokeWidth: 0 }}
                />
                <Line
                  yAxisId="recall"
                  type="monotone"
                  dataKey="predicted"
                  isAnimationActive={false}
                  stroke={c.inkFaint}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  yAxisId="recall"
                  type="monotone"
                  dataKey="actual"
                  isAnimationActive={false}
                  stroke={c.positive}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.18} y={0}>
          <ChartCard
            title="Review volume"
            emptyDrawing="activity"
            empty={!hasReviews}
            emptyMessage="Complete a review to see activity."
            delay={0.18}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volume} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={6} minTickGap={8} />
                <YAxis allowDecimals={false} {...axisProps} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: c.line, opacity: 0.4 }}
                  formatter={(v) => [v, 'Reviews']}
                />
                <Bar
                  dataKey="reviews"
                  isAnimationActive={false}
                  fill={c.positive}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.24} y={0}>
          <ChartCard
            title="Study time"
            emptyDrawing="time"
            empty={!hasReviews}
            emptyMessage="Complete a review to see study time."
            delay={0.24}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studyTime} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="timeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={6} minTickGap={8} />
                <YAxis allowDecimals={false} {...axisProps} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} min`, 'Time']}
                  cursor={{ stroke: c.line }}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  isAnimationActive={false}
                  stroke={c.accent}
                  strokeWidth={2}
                  fill="url(#timeFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.3} y={0}>
          <ChartCard
            title="Observed recall by card age"
            emptyDrawing="recall"
            empty={!hasReviews}
            emptyMessage="Complete a review to see recall."
            delay={0.3}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={retention} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="ageLabel" {...axisProps} interval={0} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: c.line, opacity: 0.4 }}
                  formatter={(value, _name, item) => [
                    `${value}% (n=${item.payload?.count ?? 0})`,
                    'Observed recall',
                  ]}
                />
                <Bar
                  dataKey="retention"
                  isAnimationActive={false}
                  fill={c.accent}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.36} y={0}>
          <ChartCard
            title="Leech count by course"
            emptyDrawing="leech"
            empty={leeches.length === 0}
            emptyMessage="No leech cards."
            delay={0.36}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leeches} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis
                  dataKey="name"
                  {...axisProps}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} {...axisProps} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: c.line, opacity: 0.4 }}
                  formatter={(v) => [v, 'Leeches']}
                />
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  fill={c.accent}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>

        <FadeInView delay={0.42} y={0}>
          <ChartCard
            title="Stability profile"
            emptyDrawing="stability"
            empty={cards.length === 0}
            emptyMessage="Add cards to see stability."
            delay={0.42}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="range" {...axisProps} interval={0} />
                <YAxis allowDecimals={false} {...axisProps} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: c.line, opacity: 0.4 }}
                  formatter={(v) => [v, 'Cards']}
                />
                <Bar dataKey="count" isAnimationActive={false} radius={[6, 6, 0, 0]}>
                  {profile.map((entry, i) => (
                    <Cell key={i} fill={entry.range === 'New' ? c.inkFaint : c.accent} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>{' '}
          </ChartCard>
        </FadeInView>
      </div>
    </div>
  );
}
