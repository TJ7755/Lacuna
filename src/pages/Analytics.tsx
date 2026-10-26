import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useMemo, useState } from 'react';
import { AppLink as Link } from '../components/ui/AppLink';
import { useAllCards, useAllReviewHistory, useAllSessionHistory } from '../state/useData';
import { useCourses } from '../state/useCourseData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useAdvancedDetails } from '../state/advancedDetails';
import { ChartCard } from '../components/analytics/ChartCard';
import { Rise } from '../components/analytics/Arrival';
import { KpiRow } from '../components/analytics/KpiRow';
import { AreaTrend, Columns, HorizontalBars } from '../components/analytics/charts';
import { PredictionAccuracyCard, WorkloadForecastCard } from '../components/analytics/SeriesCards';
import { useChartColours } from '../components/analytics/useChartColours';
import {
  forecastSeries,
  studyTimeSeries,
  totalStudyMinutes,
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
import { addDays } from '../fsrs/heatmap';
import { startOfDay } from '../utils/datetime';

/** Lets a chart card fill its grid row so neighbours line up. */
const CELL = 'min-w-0 [&>section]:h-full';

type Period = '7' | '30' | '90';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

/** Label spacing that keeps the date axis to a handful of ticks at every period. */
const X_INTERVAL: Record<Period, number> = { '7': 0, '30': 6, '90': 14 };

export function Analytics() {
  const [motionSpeed] = useMotionSpeed();
  const [advancedDetails] = useAdvancedDetails();
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
    () => new Map(activeCourses.map((course) => [course.id, course])),
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
  // Follows the period selector like the other time series.
  const trajectory = useMemo(() => {
    const from = addDays(startOfDay(Date.now()), 1 - days);
    return globalTrajectorySeries(courseHistory).filter((point) => point.day >= from);
  }, [courseHistory, days]);
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
        <PageLoading />
      </div>
    );
  }

  return (
    <div className={`${PAGE_FRAME} flex flex-col gap-4 pb-10 pt-6 md:gap-6 md:pt-8`}>
      <Rise index={0} className="mb-4 flex flex-wrap items-start justify-between gap-4 md:mb-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Progress
        </h1>
        <PillToggleGroup label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      </Rise>

      <Rise index={1}>
        <KpiRow
          label="Summary"
          multiplier={m}
          items={[
            { label: 'Reviews', value: volume.reduce((sum, point) => sum + point.reviews, 0) },
            {
              label: 'Study time',
              value: totalStudyMinutes(studyTime),
              unit: 'min',
            },
            { label: 'Recall', value: overallRecall(retention), unit: '%' },
            { label: 'Cards', value: cards.length },
          ]}
        />
      </Rise>

      <Rise index={2}>
        <ReviewHeatmap cards={cards} activity={activity} days={days} />
      </Rise>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Predicted exam-day recall"
            description="Each point is a day you studied, averaging the courses studied that day."
            data={{
              columns: ['Date', 'Predicted recall (%)', 'Courses'],
              rows: trajectory.map((point) => [
                point.label,
                point.retrievability,
                point.courses ?? 1,
              ]),
            }}
            emptyDrawing="prediction"
            empty={trajectory.length < 2}
            emptyMessage={
              trajectory.length === 1
                ? `Predicted ${trajectory[0].retrievability}% on ${trajectory[0].label}. Study on another day to see a trend.`
                : 'Complete reviews to plot a trajectory.'
            }
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
              rows: studyTime.map((point) => [point.label, Math.round(point.minutes * 10) / 10]),
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
              format={(value) => `${Math.round(Number(value) * 10) / 10} min`}
              xInterval={xInterval}
            />
          </ChartCard>
        </FadeInView>

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title="Observed recall by card age"
            description="How often you recalled cards in past reviews, by how long you had been studying each one."
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

        {advancedDetails && (
          <FadeInView y={12} className={CELL}>
            <PredictionAccuracyCard prediction={prediction} />
          </FadeInView>
        )}

        {advancedDetails && (
          <FadeInView y={12} className={CELL}>
            <ChartCard
              title="Stability profile"
              description="Days until each card's recall is likely to fall to 90%. Longer means more durable; new cards have no estimate yet."
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
        )}

        <FadeInView y={12} className={CELL}>
          <ChartCard
            title={advancedDetails ? 'Leech count by course' : 'Cards you often miss by course'}
            description="Cards you keep forgetting. Rewording or splitting them usually helps more than reviewing again."
            action={
              <Link
                to="/search?filter=leech"
                className="-ml-3 inline-flex min-h-11 items-center rounded-full px-3 text-ink-soft hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                {advancedDetails ? 'Show leech cards' : 'Show cards you often miss'}
              </Link>
            }
            data={{
              columns: ['Course', advancedDetails ? 'Leeches' : 'Cards you often miss'],
              rows: leeches.map((point) => [point.name, point.count]),
            }}
            emptyDrawing="leech"
            empty={leeches.length === 0}
            emptyMessage={advancedDetails ? 'No leech cards.' : 'No cards you often miss.'}
          >
            <HorizontalBars
              data={leeches}
              nameKey="name"
              valueKey="count"
              name={advancedDetails ? 'Leeches' : 'Cards you often miss'}
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
