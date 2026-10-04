import { useMemo } from 'react';
import { ChartCard } from './ChartCard';
import { AreaTrend, Columns } from './charts';
import { LessonBreakdownCard } from './SeriesCards';
import { useChartColours } from './useChartColours';
import { FadeInView } from '../ui/FadeInView';
import { lessonBreakdown, reviewVolume, stabilityProfile, trajectorySeries } from './prepare';
import type { Card, Course, Lesson, SessionHistoryEntry } from '../../db/types';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';

interface CourseAnalyticsProps {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  reviewHistory: ReviewHistoryEntry[];
  history: SessionHistoryEntry[];
}

/** Lets a chart card fill its grid row so neighbours line up. */
const CELL = '[&>section]:h-full';

/**
 * Course-scoped analytics: predicted exam-day trajectory, stability profile and
 * review volume across the course's deduplicated card set (Addendum 2 §J — the
 * same card pool `progressValue` and the path view's mastery figure use), plus a
 * per-lesson breakdown of card count, mastery and completion.
 */
export function CourseAnalytics({
  course,
  lessons,
  cards,
  reviewHistory,
  history,
}: CourseAnalyticsProps) {
  const c = useChartColours();

  const trajectory = useMemo(() => trajectorySeries(history), [history]);
  const profile = useMemo(() => stabilityProfile(cards), [cards]);
  const volume = useMemo(
    () => reviewVolume(cards, 30, Date.now(), reviewHistory),
    [cards, reviewHistory],
  );
  const breakdown = useMemo(
    () => lessonBreakdown(lessons, cards, course),
    [lessons, cards, course],
  );
  const hasReviews = reviewHistory.length > 0;

  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
      <FadeInView className={`${CELL} lg:col-span-2`} y={12}>
        <ChartCard
          title="Predicted exam-day score"
          data={{
            columns: ['Date', 'Predicted score (%)'],
            rows: trajectory.map((point) => [point.label, point.retrievability]),
          }}
          emptyDrawing="prediction"
          empty={trajectory.length < 2}
          emptyMessage="Study this course to start plotting your trajectory."
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

      <FadeInView className={`${CELL} lg:col-span-2`} y={12}>
        <LessonBreakdownCard breakdown={breakdown} />
      </FadeInView>

      <FadeInView className={CELL} y={12}>
        <ChartCard
          title="Card stability profile"
          data={{
            columns: ['Stability', 'Cards'],
            rows: profile.map((point) => [point.range, point.count]),
          }}
          emptyDrawing="stability"
          empty={cards.length === 0}
          emptyMessage="Add cards to see their stability profile."
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

      <FadeInView className={CELL} y={12}>
        <ChartCard
          title="Review volume"
          data={{
            columns: ['Date', 'Reviews'],
            rows: volume.map((point) => [point.label, point.reviews]),
          }}
          emptyDrawing="activity"
          empty={!hasReviews}
          emptyMessage="Your daily review counts will appear here."
        >
          <Columns
            data={volume}
            xKey="label"
            yKey="reviews"
            name="Reviews"
            colour={c.positive}
            xInterval={6}
          />
        </ChartCard>
      </FadeInView>
    </div>
  );
}
