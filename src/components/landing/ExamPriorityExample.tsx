import { useMemo, useState } from 'react';
import { CalendarRecall } from './CalendarRecall';
import { EXAM_DAY, planCalendar, SLOT_HOURS } from './calendarProjection';
import './ExamPriorityExample.css';

const label = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function ExamPriorityExample() {
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + day);
        return date;
      }),
    [],
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
          <span>When are you free?</span>
          <strong className="exam-fixed-date">Exam · {label(dates[EXAM_DAY])}</strong>
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
                  <span>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  <strong>{date.getDate()}</strong>
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
        <div className="exam-calendar-footer">
          <span>Example week</span>
          <output aria-live="polite">
            {sessions.length ? `${sessions.length} reviews scheduled` : 'Choose a free slot'}
          </output>
        </div>
      </div>
      <CalendarRecall slots={sessions} />
    </div>
  );
}
