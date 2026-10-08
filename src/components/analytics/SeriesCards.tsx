// Chart cards with more than one series: each states its values in a direct legend
// rather than in a repeated caption, and shares the chart look from chartStyle.

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { ChartCard, ChartFrame } from './ChartCard';
import { useChartStyle } from './chartStyle';
import type { ForecastPoint, LessonBreakdownPoint } from './prepare';
import type { PredictionAccuracyPoint } from '../../fsrs/calibration';
import { countOf } from '../../utils/plural';

const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };

/**
 * Lesson names on the slanted breakdown axis, cut to what its height shows. A longer
 * name ran past the axis and was clipped mid-word; the tooltip and data table keep it whole.
 */
const LESSON_TICK_CHARS = 22;
export function lessonTickLabel(name: string): string {
  return name.length > LESSON_TICK_CHARS
    ? `${name.slice(0, LESSON_TICK_CHARS - 1).trimEnd()}…`
    : name;
}

/** Rounds a stacked bar's top corners only where it is the top of its column. */
function stackTop(top: boolean): [number, number, number, number] {
  return top ? [4, 4, 0, 0] : [0, 0, 0, 0];
}

/** Cards due and new cards per day for the next 30 days, stacked. */
export function WorkloadForecastCard({
  forecast,
  hasCards,
}: {
  forecast: ForecastPoint[];
  hasCards: boolean;
}) {
  const s = useChartStyle();
  const due = forecast.reduce((sum, point) => sum + point.due, 0);
  const fresh = forecast.reduce((sum, point) => sum + point.newCards, 0);
  return (
    <ChartCard
      title="Workload ahead"
      data={{
        columns: ['Date', 'Due cards', 'New cards'],
        rows: forecast.map((point) => [point.label, point.due, point.newCards]),
      }}
      legend={[
        { label: 'Due', colour: s.c.accent, value: String(due) },
        { label: 'New', colour: s.c.positive, value: String(fresh) },
      ]}
      emptyDrawing="prediction"
      empty={!hasCards}
      emptyMessage="Add cards to forecast reviews."
    >
      <ChartFrame>
        {/* Bars, not an area: each day's count stands alone, so a day of many new cards
            reads as one tall bar rather than a spike dragging a line across its neighbours. */}
        <BarChart data={forecast} margin={CHART_MARGIN} barCategoryGap="22%">
          <XAxis dataKey="label" interval={6} {...s.xAxis} />
          <YAxis allowDecimals={false} {...s.yAxis} />
          <Tooltip {...s.tooltip} cursor={s.cursorBar} />
          <Bar
            dataKey="due"
            name="Due"
            stackId="day"
            maxBarSize={18}
            fill={s.c.accent}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                radius={stackTop((props.payload as ForecastPoint).newCards === 0)}
              />
            )}
            {...s.animate}
          />
          <Bar
            dataKey="newCards"
            name="New"
            stackId="day"
            maxBarSize={18}
            fill={s.c.positive}
            radius={stackTop(true)}
            {...s.animate}
          />
        </BarChart>
      </ChartFrame>
    </ChartCard>
  );
}

/** Brier score against predicted and actual recall; the legend carries the latest values. */
export function PredictionAccuracyCard({ prediction }: { prediction: PredictionAccuracyPoint[] }) {
  const s = useChartStyle();
  const latest = prediction[prediction.length - 1];
  return (
    <ChartCard
      title="Prediction accuracy"
      description="Brier score · lower is better"
      data={{
        columns: ['Date', 'Brier score', 'Predicted recall (%)', 'Actual recall (%)'],
        rows: prediction.map((point) => [
          point.label,
          point.brier.toFixed(3),
          Math.round(point.predicted * 100),
          Math.round(point.actual * 100),
        ]),
      }}
      legend={
        latest
          ? [
              { label: 'Brier', colour: s.c.accent, value: latest.brier.toFixed(3) },
              {
                label: 'Predicted',
                colour: s.c.inkFaint,
                value: `${Math.round(latest.predicted * 100)}%`,
                dashed: true,
              },
              {
                label: 'Actual',
                colour: s.c.positive,
                value: `${Math.round(latest.actual * 100)}%`,
              },
            ]
          : undefined
      }
      emptyDrawing="accuracy"
      empty={prediction.length === 0}
      emptyMessage="Complete reviews to measure accuracy."
    >
      <ChartFrame>
        <LineChart data={prediction} margin={CHART_MARGIN}>
          <XAxis dataKey="label" {...s.xAxis} />
          <YAxis yAxisId="score" domain={[0, 1]} {...s.yAxis} />
          <YAxis yAxisId="recall" orientation="right" domain={[0, 1]} hide />
          <Tooltip
            {...s.tooltip}
            cursor={s.cursorLine}
            formatter={(v, name) => {
              const value = typeof v === 'number' ? v : Number(v ?? 0);
              if (name === 'brier') return [value.toFixed(3), 'Brier score'];
              return [`${Math.round(value * 100)}%`, name === 'predicted' ? 'Predicted' : 'Actual'];
            }}
          />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="brier"
            stroke={s.c.accent}
            strokeWidth={2.5}
            dot={prediction.length <= 14 ? { r: 3.5, fill: s.c.accent, strokeWidth: 0 } : false}
            activeDot={{ r: 5, strokeWidth: 0 }}
            {...s.animate}
          />
          <Line
            yAxisId="recall"
            type="monotone"
            dataKey="predicted"
            stroke={s.c.inkFaint}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            {...s.animate}
          />
          <Line
            yAxisId="recall"
            type="monotone"
            dataKey="actual"
            stroke={s.c.positive}
            strokeWidth={2}
            dot={false}
            {...s.animate}
          />
        </LineChart>
      </ChartFrame>
    </ChartCard>
  );
}

/**
 * Mastery and completion for each lesson. Card counts stay in the tooltip and data table:
 * plotted on a hidden second axis, a count read against the percentage scale.
 */
export function LessonBreakdownCard({ breakdown }: { breakdown: LessonBreakdownPoint[] }) {
  const s = useChartStyle();
  const mean = (pick: (point: LessonBreakdownPoint) => number) =>
    breakdown.length > 0
      ? Math.round(breakdown.reduce((sum, point) => sum + pick(point), 0) / breakdown.length)
      : 0;
  return (
    <ChartCard
      title="Lesson breakdown"
      data={{
        columns: ['Lesson', 'Cards', 'Mastery (%)', 'Completion (%)'],
        rows: breakdown.map((point) => [
          point.name,
          point.cardCount,
          point.masteryPct,
          point.completionPct,
        ]),
      }}
      legend={[
        { label: 'Mastery', colour: s.c.accent, value: `${mean((p) => p.masteryPct)}%` },
        { label: 'Completion', colour: s.c.positive, value: `${mean((p) => p.completionPct)}%` },
      ]}
      emptyDrawing="course"
      empty={breakdown.length === 0}
      emptyMessage="This course has no lessons yet."
      className="h-72"
    >
      <ChartFrame>
        <BarChart data={breakdown} margin={CHART_MARGIN} barGap={4}>
          <XAxis
            dataKey="name"
            {...s.xAxis}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={72}
            tickFormatter={lessonTickLabel}
          />
          <YAxis domain={[0, 100]} unit="%" {...s.yAxis} width={44} />
          <Tooltip
            {...s.tooltip}
            cursor={s.cursorBar}
            labelFormatter={(name, payload) => {
              const cards = (payload[0]?.payload as LessonBreakdownPoint | undefined)?.cardCount;
              return cards === undefined ? name : `${name} · ${countOf(cards, 'card')}`;
            }}
            formatter={(v, name) => [`${v}%`, name === 'masteryPct' ? 'Mastery' : 'Completion']}
          />
          <Bar
            dataKey="masteryPct"
            radius={[8, 8, 0, 0]}
            maxBarSize={24}
            fill={s.c.accent}
            {...s.animate}
          />
          <Bar
            dataKey="completionPct"
            radius={[8, 8, 0, 0]}
            maxBarSize={24}
            fill={s.c.positive}
            {...s.animate}
          />
        </BarChart>
      </ChartFrame>
    </ChartCard>
  );
}
