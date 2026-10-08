// Chart cards with more than one series: each states its values in a direct legend
// rather than in a repeated caption, and shares the chart look from chartStyle.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, ChartFrame } from './ChartCard';
import { useChartStyle } from './chartStyle';
import type { ForecastPoint, LessonBreakdownPoint } from './prepare';
import type { PredictionAccuracyPoint } from '../../fsrs/calibration';

const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };

/**
 * Lesson names on the slanted breakdown axis, cut to what its height shows. A longer
 * name ran past the axis and was clipped mid-word; the tooltip and data table keep it whole.
 */
const LESSON_TICK_CHARS = 22;
export function lessonTickLabel(name: string): string {
  return name.length > LESSON_TICK_CHARS ? `${name.slice(0, LESSON_TICK_CHARS - 1).trimEnd()}…` : name;
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
        <AreaChart data={forecast} margin={CHART_MARGIN}>
          <XAxis dataKey="label" interval={6} {...s.xAxis} />
          <YAxis allowDecimals={false} {...s.yAxis} />
          <Tooltip {...s.tooltip} cursor={s.cursorLine} />
          <Area
            type="monotone"
            dataKey="due"
            name="Due"
            stackId="1"
            stroke={s.c.accent}
            strokeWidth={2.5}
            fill={s.c.accent}
            fillOpacity={0.18}
            dot={false}
            {...s.animate}
          />
          <Area
            type="monotone"
            dataKey="newCards"
            name="New"
            stackId="1"
            stroke={s.c.positive}
            strokeWidth={2.5}
            fill={s.c.positive}
            fillOpacity={0.18}
            dot={false}
            {...s.animate}
          />
        </AreaChart>
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

/** Mastery and completion for each lesson, with its card count as a dotted line. */
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
        {
          label: 'Cards',
          colour: s.c.inkFaint,
          value: String(breakdown.reduce((sum, point) => sum + point.cardCount, 0)),
          dashed: true,
        },
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
          <YAxis yAxisId="pct" domain={[0, 100]} unit="%" {...s.yAxis} width={44} />
          <YAxis yAxisId="cards" orientation="right" allowDecimals={false} hide />
          <Tooltip
            {...s.tooltip}
            cursor={s.cursorBar}
            formatter={(v, name) => {
              if (name === 'cardCount') return [v, 'Cards'];
              return [`${v}%`, name === 'masteryPct' ? 'Mastery' : 'Completion'];
            }}
          />
          <Bar
            yAxisId="pct"
            dataKey="masteryPct"
            radius={[8, 8, 0, 0]}
            maxBarSize={24}
            fill={s.c.accent}
            {...s.animate}
          />
          <Bar
            yAxisId="pct"
            dataKey="completionPct"
            radius={[8, 8, 0, 0]}
            maxBarSize={24}
            fill={s.c.positive}
            {...s.animate}
          />
          <Line
            yAxisId="cards"
            type="monotone"
            dataKey="cardCount"
            stroke={s.c.inkFaint}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3, fill: s.c.inkFaint, strokeWidth: 0 }}
            {...s.animate}
          />
        </BarChart>
      </ChartFrame>
    </ChartCard>
  );
}
