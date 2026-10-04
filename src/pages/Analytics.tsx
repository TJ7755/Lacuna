import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useMemo, useState } from 'react';
import { useAllCards, useAllReviewHistory, useAllSessionHistory } from '../state/useData';
import { useCourses } from '../state/useCourseData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { ChartCard } from '../components/analytics/ChartCard';
import { Rise } from '../components/analytics/Arrival';
import { KpiRow } from '../components/analytics/KpiRow';
import { AreaTrend, Columns, HorizontalBars } from '../components/analytics/charts';
import { PredictionAccuracyCard, WorkloadForecastCard } from '../components/analytics/SeriesCards';
import { useChartColours } from '../components/analytics/useChartColours';
import {
  forecastSeries,
  studyTimeSeries,
  retentionByAge,
  leechCountByCourse,
  reviewVolume,
  stabilityProfile,
  globalTrajectorySeries,
  overallRecall,
  reviewActivityFromHistory,
} from '../components/analytics/prepare';
import { predictionAccuracySeries } from '../fsrs/calibration';
import { CourseComparison } from '../components/analytics/CourseComparison';
import { ReviewHeatmap } from '../components/dashboard/ReviewHeatmap';
import { PillToggleGroup } from '../components/cards/PillToggleGroup';
import { FadeInView } from '../components/ui/FadeInView';

/** Lets a chart card fill its grid row so neighbours line up. */
const CELL = '[&>section]:h-full';

type Period = '7' | '30' | '90';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

/** Label spacing that keeps the date axis to a handful of ticks at every period. */
const X_INTERVAL: Record<Period, number> = { '7': 0, '30': 6, '90': 14 };

function AnalyticsSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-10 md:px-12">
      <div className="h-11 w-48 animate-pulse rounded-lg bg-ink/5" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-ink/5" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-3xl bg-ink/5" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-3xl bg-ink/5" />
        ))}
      </div>
    </div>
  );
}

export function Analytics() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const courses = useCourses();
  const allCards = useAllCards();
  const reviewHistory = useAllReviewHistory();
  const history = useAllSessionHistory();
  const c = useChartColours();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);

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
    () => studyTimeSeries(cards, days, Date.now(), activeReviewHistory),
    [cards, days, activeReviewHistory],
  );
  const volume = useMemo(
    () => reviewVolume(cards, days, Date.now(), activeReviewHistory),
    [cards, days, activeReviewHistory],
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
  const activity = useMemo(
    () => reviewActivityFromHistory(activeReviewHistory),
    [activeReviewHistory],
  );

  const hasReviews = activeReviewHistory.length > 0;
  const xInterval = X_INTERVAL[period];

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
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-10 md:gap-6 md:px-12">
      <Rise index={0} className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Progress
        </h1>
        <PillToggleGroup
          label="Period"
          value={period}
          onChange={setPeriod}
          options={PERIODS}
        />
      </Rise>

      <Rise index={1}>
        <KpiRow
          label="Summary"
          multiplier={m}
          items={[
            { label: 'Reviews', value: volume.reduce((sum, point) => sum + point.reviews, 0) },
            {
              label: 'Study time',
              value: studyTime.reduce((sum, point) => sum + point.minutes, 0),
              unit: 'min',
            },
            { label: 'Recall', value: overallRecall(retention), unit: '%' },
            { label: 'Cards', value: cards.length },
          ]}
        />
      </Rise>

      <Rise index={2}>
        <ReviewHeatmap cards={cards} activity={activity} />
      </Rise>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Predicted exam-day score"
            data={{
              columns: ['Date', 'Predicted score (%)'],
              rows: trajectory.map((point) => [point.label, point.retrievability]),
            }}
            emptyDrawing="prediction"
            empty={trajectory.length < 2}
            emptyMessage="Complete reviews to plot a trajectory."
          >
            <AreaTrend
              data={trajectory}
              xKey="label"
              yKey="retrievability"
              name="Predicted"
              colour={c.accent}
              domain={[0, 100]}
              format={(value) => `${value}%`}
              tickFormat={(value) => `${value}%`}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <WorkloadForecastCard forecast={forecast} hasCards={cards.length > 0} />
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Review volume"
            data={{
              columns: ['Date', 'Reviews'],
              rows: volume.map((point) => [point.label, point.reviews]),
            }}
            emptyDrawing="activity"
            empty={!hasReviews}
            emptyMessage="Complete a review to see activity."
          >
            <Columns
              data={volume}
              xKey="label"
              yKey="reviews"
              name="Reviews"
              colour={c.positive}
              xInterval={xInterval}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Study time"
            data={{
              columns: ['Date', 'Minutes'],
              rows: studyTime.map((point) => [point.label, point.minutes]),
            }}
            emptyDrawing="time"
            empty={!hasReviews}
            emptyMessage="Complete a review to see study time."
          >
            <AreaTrend
              data={studyTime}
              xKey="label"
              yKey="minutes"
              name="Time"
              colour={c.accent}
              format={(value) => `${value} min`}
              xInterval={xInterval}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Observed recall by card age"
            data={{
              columns: ['Card age', 'Observed recall (%)', 'Reviews'],
              rows: retention.map((point) => [point.ageLabel, point.retention, point.count]),
            }}
            emptyDrawing="recall"
            empty={!hasReviews}
            emptyMessage="Complete a review to see recall."
          >
            <Columns
              data={retention}
              xKey="ageLabel"
              yKey="retention"
              name="Observed recall"
              colour={c.accent}
              domain={[0, 100]}
              xInterval={0}
              format={(value, row) => `${value}% (n=${row.count ?? 0})`}
              tickFormat={(value) => `${value}%`}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <PredictionAccuracyCard prediction={prediction} />
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Stability profile"
            data={{
              columns: ['Stability', 'Cards'],
              rows: profile.map((point) => [point.range, point.count]),
            }}
            emptyDrawing="stability"
            empty={cards.length === 0}
            emptyMessage="Add cards to see stability."
          >
            <Columns
              data={profile}
              xKey="range"
              yKey="count"
              name="Cards"
              colour={c.accent}
              xInterval={0}
              muted={(row) => row.range === 'New'}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Leech count by course"
            data={{
              columns: ['Course', 'Leeches'],
              rows: leeches.map((point) => [point.name, point.count]),
            }}
            emptyDrawing="leech"
            empty={leeches.length === 0}
            emptyMessage="No leech cards."
          >
            <HorizontalBars
              data={leeches}
              nameKey="name"
              valueKey="count"
              name="Leeches"
              colour={c.accent}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={`${CELL} lg:col-span-2`}>
          <CourseComparison
            courses={activeCourses}
            cards={cards}
            reviewHistory={activeReviewHistory}
          />
        </FadeInView>
      </div>
    </div>
  );
}
