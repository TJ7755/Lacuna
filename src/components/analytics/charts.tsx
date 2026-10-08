import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartFrame } from './ChartCard';
import { useChartStyle } from './chartStyle';

type Row = Record<string, unknown>;
type Format = (value: number, row: Row) => string;

const plain: Format = (value) => String(value);

/** A soft-filled line over time: draws in, with dots that land when there are few points. */
export function AreaTrend({
  data,
  xKey,
  yKey,
  name,
  colour,
  domain,
  format = plain,
  tickFormat,
  xInterval,
}: {
  data: object[];
  xKey: string;
  yKey: string;
  name: string;
  colour: string;
  domain?: [number, number];
  format?: Format;
  tickFormat?: (value: number) => string;
  xInterval?: number;
}) {
  const s = useChartStyle();
  const gradient = `area-${useId().replace(/:/g, '')}`;
  return (
    <ChartFrame>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey={xKey} interval={xInterval} {...s.xAxis} />
        <YAxis domain={domain} allowDecimals={false} tickFormatter={tickFormat} {...s.yAxis} />
        <Tooltip
          {...s.tooltip}
          cursor={s.cursorLine}
          formatter={(value, _name, item) => [
            format(Number(value), (item.payload ?? {}) as Row),
            name,
          ]}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={colour}
          strokeWidth={2.5}
          fill={`url(#${gradient})`}
          dot={data.length <= 14 ? { r: 3.5, fill: colour, strokeWidth: 0 } : false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          {...s.animate}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Rounded columns that grow in; `muted` picks the categories drawn in the quiet colour. */
export function Columns({
  data,
  xKey,
  yKey,
  name,
  colour,
  domain,
  format = plain,
  tickFormat,
  xInterval,
  muted,
}: {
  data: object[];
  xKey: string;
  yKey: string;
  name: string;
  colour: string;
  domain?: [number, number];
  format?: Format;
  tickFormat?: (value: number) => string;
  xInterval?: number;
  muted?: (row: Row) => boolean;
}) {
  const s = useChartStyle();
  return (
    <ChartFrame>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <XAxis dataKey={xKey} interval={xInterval} {...s.xAxis} />
        <YAxis domain={domain} allowDecimals={false} tickFormatter={tickFormat} {...s.yAxis} />
        <Tooltip
          {...s.tooltip}
          cursor={s.cursorBar}
          formatter={(value, _name, item) => [
            format(Number(value), (item.payload ?? {}) as Row),
            name,
          ]}
        />
        <Bar dataKey={yKey} radius={[8, 8, 0, 0]} maxBarSize={36} fill={colour} {...s.animate}>
          {muted &&
            data.map((row, index) => (
              <Cell key={index} fill={muted(row as Row) ? s.c.inkFaint : colour} />
            ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Horizontal bars for named categories, so long names read without rotating. */
export function HorizontalBars({
  data,
  nameKey,
  valueKey,
  name,
  colour,
}: {
  data: object[];
  nameKey: string;
  valueKey: string;
  name: string;
  colour: string;
}) {
  const s = useChartStyle();
  return (
    <ChartFrame>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} {...s.yAxis} width={110} interval={0} />
        <Tooltip
          {...s.tooltip}
          cursor={s.cursorBar}
          formatter={(value) => [String(value), name]}
        />
        <Bar dataKey={valueKey} radius={[0, 8, 8, 0]} maxBarSize={22} fill={colour} {...s.animate} />
      </BarChart>
    </ChartFrame>
  );
}
