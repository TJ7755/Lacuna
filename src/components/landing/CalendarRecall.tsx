import { EXAM_DAY, projectCalendar, slotTime } from './calendarProjection';

const x = (day: number) => 24 + (day / EXAM_DAY) * 312;
const y = (recall: number) => 214 - recall * 170;
const path = (points: [number, number][]) =>
  points.map(([day, recall], index) => `${index ? 'L' : 'M'} ${x(day)} ${y(recall)}`).join(' ');
const baseline = projectCalendar([]);

export function CalendarRecall({ slots }: { slots: number[] }) {
  const projection = projectCalendar(slots);
  return (
    <figure className="calendar-recall">
      <figcaption>Remember on exam day</figcaption>
      <output aria-live="polite" aria-label="Illustrative recall on exam day">
        {(projection.recall * 100).toFixed(1)}%
      </output>
      <svg
        viewBox="0 0 360 250"
        role="img"
        aria-label="Forgetting curve for the selected revision sessions"
      >
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
        <text x="24" y="244">
          Today
        </text>
        <text x="336" y="244" textAnchor="end">
          Exam day
        </text>
      </svg>
      <span>Illustrative recall · successful reviews</span>
    </figure>
  );
}
