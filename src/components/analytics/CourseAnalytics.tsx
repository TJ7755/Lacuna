import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { FadeInView } from '../ui/FadeInView';
import { useChartColours } from './useChartColours';
import {
  lessonBreakdown,
  reviewVolume,
  stabilityProfile,
  trajectorySeries,
} from './prepare';
import type { Card, Course, Lesson, SessionHistoryEntry } from '../../db/types';

interface CourseAnalyticsProps {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  history: SessionHistoryEntry[];
}

/**
 * Course-scoped analytics: predicted exam-day trajectory, stability profile and
 * review volume across the course's deduplicated card set (Addendum 2 §J — the
 * same card pool `progressValue` and the path view's mastery figure use), plus a
 * per-lesson breakdown of card count, mastery and completion.
 */
export function CourseAnalytics({ course, lessons, cards, history }: CourseAnalyticsProps) {
  const c = useChartColours();

  const trajectory = useMemo(() => trajectorySeries(history), [history]);
  const profile = useMemo(() => stabilityProfile(cards), [cards]);
  const volume = useMemo(() => reviewVolume(cards), [cards]);
  const breakdown = useMemo(
    () => lessonBreakdown(lessons, cards, course),
    [lessons, cards, course],
  );
  const hasReviews = useMemo(
    () => cards.some((card) => card.history.length > 0),
    [cards],
  );

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FadeInView className="lg:col-span-2" delay={0} y={0}>
        <ChartCard
          title="Predicted exam-day score"
          description="Average predicted retrievability across the course's cards, over time."
          empty={trajectory.length < 2}
          emptyMessage="Study this course to start plotting your trajectory."
          delay={0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trajectory} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="courseTrajFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.line} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps} width={44} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [`${v}%`, 'Predicted']}
                cursor={{ stroke: c.line }}
              />
              <Area
                type="monotone"
                dataKey="retrievability"
                stroke={c.accent}
                strokeWidth={2}
                fill="url(#courseTrajFill)"
                dot={{ r: 2.5, fill: c.accent, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </FadeInView>

      <FadeInView className="lg:col-span-2" delay={0.06} y={0}>
        <ChartCard
          title="Lesson breakdown"
          description="Mastery and completion per lesson. Line shows card count."
          empty={breakdown.length === 0}
          emptyMessage="This course has no lessons yet."
          delay={0.06}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdown} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={c.line} vertical={false} />
              <XAxis dataKey="name" {...axisProps} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis yAxisId="pct" domain={[0, 100]} unit="%" {...axisProps} width={40} />
              <YAxis yAxisId="cards" orientation="right" allowDecimals={false} hide />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: c.line, opacity: 0.4 }}
                formatter={(v: number, name: string) => {
                  if (name === 'cardCount') return [v, 'Cards'];
                  return [`${v}%`, name === 'masteryPct' ? 'Mastery' : 'Completion'];
                }}
              />
              <Bar yAxisId="pct" dataKey="masteryPct" fill={c.accent} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="pct" dataKey="completionPct" fill={c.positive} radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="cards"
                type="monotone"
                dataKey="cardCount"
                stroke={c.inkFaint}
                strokeDasharray="4 4"
                dot={{ r: 2.5, fill: c.inkFaint, strokeWidth: 0 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </FadeInView>

      <FadeInView delay={0.12} y={0}>
        <ChartCard
          title="Card stability profile"
          description="How many cards fall into each stability range."
          empty={cards.length === 0}
          emptyMessage="Add cards to see their stability profile."
          delay={0.12}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profile} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={c.line} vertical={false} />
              <XAxis dataKey="range" {...axisProps} interval={0} />
              <YAxis allowDecimals={false} {...axisProps} width={32} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: c.line, opacity: 0.4 }}
                formatter={(v: number) => [v, 'Cards']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {profile.map((entry, i) => (
                  <Cell key={i} fill={entry.range === 'New' ? c.inkFaint : c.accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </FadeInView>

      <FadeInView delay={0.18} y={0}>
        <ChartCard
          title="Review volume"
          description="Reviews completed each day over the past 30 days."
          empty={!hasReviews}
          emptyMessage="Your daily review counts will appear here."
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
                formatter={(v: number) => [v, 'Reviews']}
              />
              <Bar dataKey="reviews" fill={c.positive} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </FadeInView>
    </div>
  );
}
