// A tiny inline sparkline: draws a smooth decaying curve from pre-sampled
// polyline points (see memoryFieldMath.curvePoints for the FSRS forgetting
// curve this is built to show). Deliberately axis-less and understated —
// this is a mood mark inside a hover squircle, not a chart.

interface MiniCurveProps {
  /** SVG polyline points, e.g. from curvePoints(). */
  points: string;
  width: number;
  height: number;
  /** Optional dashed reference line at this fraction of height (0 = top). */
  thresholdY?: number;
}

export function MiniCurve({ points, width, height, thresholdY }: MiniCurveProps) {
  const last = points.split(' ').pop();
  const [lastX, lastY] = (last ?? '0,0').split(',').map(Number);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      aria-hidden="true"
    >
      {thresholdY !== undefined && (
        <line
          x1={0}
          y1={thresholdY * height}
          x2={width}
          y2={thresholdY * height}
          stroke="hsl(var(--line-strong))"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.75} fill="hsl(var(--accent))" />
    </svg>
  );
}
