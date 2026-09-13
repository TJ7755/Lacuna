import { EXAM_DAY, projectCalendar, slotTime } from './calendarProjection';

const x = (day: number) => 52 + (day / EXAM_DAY) * 284;
const y = (recall: number) => 214 - ((recall - 0.8) / 0.2) * 170;
const path = (points: [number, number][]) =>
  points.map(([day, recall], index) => `${index ? 'L' : 'M'} ${x(day)} ${y(recall)}`).join(' ');
const baseline = projectCalendar([]);

export function CalendarRecall({ slots }: { slots: number[] }) {
  const projection = projectCalendar(slots);
  return (
    <figure className="calendar-recall">
      <figcaption>Example recall</figcaption>
      <output
        aria-live="polite"
        aria-label="Illustrative recall on exam day, assuming successful reviews"
      >
        {(projection.recall * 100).toFixed(1)}%
      </output>
      <svg
        viewBox="0 0 360 250"
        role="img"
        aria-label="Forgetting curve for the selected revision sessions. Vertical axis: 80% to 100% recall."
      >
        {[0.8, 0.9, 1].map((recall) => (
          <g key={recall} className="calendar-curve-tick">
            <line x1="52" x2="336" y1={y(recall)} y2={y(recall)} />
            <text x="42" y={y(recall) + 4} textAnchor="end">
              {Math.round(recall * 100)}%
            </text>
          </g>
        ))}
        <path className="calendar-curve-baseline" d={path(baseline.points)} />
        <path
          key={slots.join(',')}
          className="calendar-curve-line"
          d={path(projection.points)}
          pathLength="1"
        />
        {slots.map((slot) => (
          <circle key={slot} cx={x(slotTime(slot))} cy={y(1)} r="4" />
        ))}
        <line x1={x(EXAM_DAY)} x2={x(EXAM_DAY)} y1="24" y2="218" />
        <text x="52" y="244">
          Today
        </text>
        <text x="336" y="244" textAnchor="end">
          Exam day
        </text>
      </svg>
    </figure>
  );
}
