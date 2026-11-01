import { useMemo } from 'react';
import { ChartCard } from './ChartCard';
import { Columns } from './charts';
import { LessonBreakdownCard } from './SeriesCards';
import { useChartColours } from './useChartColours';
import { FadeInView } from '../ui/FadeInView';
import { reviewVolume, stabilityProfile } from './prepare';
import { progressHeading } from '../../fsrs/objective';
import type { Card, Course } from '../../db/types';
import type { LessonProgress } from '../../course/courseProgress';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';
import { useAdvancedDetails } from '../../state/advancedDetails';

interface CourseAnalyticsProps {
  course: Course;
  /** The Progress scope's per-lesson rows, sharing its card pool and date. */
  lessons: LessonProgress[];
  cards: Card[];
  reviewHistory: ReviewHistoryEntry[];
}

/** Lets a chart card fill its grid row so neighbours line up. */
const CELL = 'min-w-0 [&>section]:h-full';

/**
 * Course-scoped analytics: the selected scope's per-lesson breakdown, then stability
 * profile and review volume across the course's cards. The exam-day trend is the
 * forecast card's, above these.
 */
export function CourseAnalytics({ course, lessons, cards, reviewHistory }: CourseAnalyticsProps) {
  const c = useChartColours();
  const [advancedDetails] = useAdvancedDetails();

  const profile = useMemo(() => stabilityProfile(cards), [cards]);
  const volume = useMemo(
    () => reviewVolume(cards, 30, Date.now(), reviewHistory),
    [cards, reviewHistory],
  );
  const hasReviews = reviewHistory.length > 0;

  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
      <FadeInView className={`${CELL} lg:col-span-2`} y={12}>
        <LessonBreakdownCard lessons={lessons} objectiveLabel={progressHeading(course)} />
      </FadeInView>

      {advancedDetails && (
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
      )}

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
