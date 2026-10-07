import { useMemo } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useChartColours } from './useChartColours';

/**
 * One look for every chart: body-face labels, no axis rules but the baseline, no
 * gridlines, a soft floating tooltip, and a drawing animation scaled by the motion
 * multiplier (and off when it is zero).
 */
export function useChartStyle() {
  const c = useChartColours();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  return useMemo(() => {
    const tick = { fill: c.inkFaint, fontSize: 12, fontFamily: 'var(--font-body)' };
    return {
      c,
      m,
      xAxis: { tick, tickLine: false, axisLine: { stroke: c.line }, minTickGap: 12, tickMargin: 8 },
      yAxis: { tick, tickLine: false, axisLine: false, tickCount: 4, width: 'auto' as const },
      tooltip: {
        contentStyle: {
          background: c.surface,
          border: 'none',
          borderRadius: 14,
          boxShadow: '0 12px 32px -12px hsl(var(--ink) / 0.35)',
          color: c.ink,
          fontSize: 13,
          fontFamily: 'var(--font-body)',
        },
        itemStyle: { color: c.ink },
        labelStyle: { color: c.inkSoft, marginBottom: 2 },
      },
      cursorLine: { stroke: c.line },
      cursorBar: { fill: c.line, opacity: 0.35 },
      animate: {
        isAnimationActive: m > 0,
        animationDuration: Math.round(900 * m),
        animationEasing: 'ease-out' as const,
      },
    };
  }, [c, m]);
}
