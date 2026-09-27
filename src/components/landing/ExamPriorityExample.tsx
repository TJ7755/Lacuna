import { useEffect, useMemo, useState } from 'react';
import { CalendarRecall } from './CalendarRecall';
import { EXAM_DAY, planCalendar, SLOT_HOURS } from './calendarProjection';
import './ExamPriorityExample.css';

const label = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function ExamPriorityExample() {
  // The prerender stamps build-time dates; recompute after mount so the
  // hydrated page shows this week. The first client render still uses the
  // state initialiser, which is why the date labels below suppress the
  // expected hydration warning.
  const [today, setToday] = useState(() => Date.now());
  useEffect(() => {
    setToday(Date.now());
  }, []);
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) => {
        const date = new Date(today);
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + day);
        return date;
      }),
    [today],
  );
  const [available, setAvailable] = useState<number[]>([4, 9, 17]);
  const sessions = useMemo(() => planCalendar(available), [available]);
  const toggle = (slot: number) =>
    setAvailable((current) =>
      current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot],
    );

  return (
    <div className="calendar-and-recall">
      <div className="exam-calendar">
        <div className="exam-calendar-toolbar">
          <span>Tap the times you’re free</span>
        </div>
        <div
          className="exam-calendar-window"
          tabIndex={0}
          role="region"
          aria-label="Choose available days and times"
        >
          <div className="exam-calendar-week">
            {dates.map((date, day) => (
              <div className="exam-calendar-day" key={day} data-exam={day === EXAM_DAY}>
                <div className="exam-calendar-date">
                  {/* Prerendered dates are stamped at build time; the hydrated page
                      recomputes them for today. Suppress the expected mismatch. */}
                  <span suppressHydrationWarning>
                    {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <strong suppressHydrationWarning>{date.getDate()}</strong>
                </div>
                {day === EXAM_DAY ? (
                  <div className="exam-calendar-deadline">Exam day</div>
                ) : (
                  SLOT_HOURS.map((hour, time) => {
                    const slot = day * 3 + time;
                    const selected = available.includes(slot);
                    const planned = sessions.includes(slot);
                    return (
                      <button
                        type="button"
                        className="exam-calendar-slot"
                        key={hour}
                        aria-label={`${label(date)} at ${hour}:00`}
                        suppressHydrationWarning
                        aria-pressed={selected}
                        data-planned={planned}
                        onClick={() => toggle(slot)}
                      >
                        <span>{String(hour).padStart(2, '0')}:00</span>
                        <strong>{planned ? 'Review' : selected ? 'Free' : '+'}</strong>
                        {planned && <small>10 min</small>}
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <CalendarRecall slots={sessions} />
    </div>
  );
}
