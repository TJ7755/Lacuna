import { useMemo, useState } from 'react';
import './ExamPriorityExample.css';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const label = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const topics = ['Cell division', 'Chemical bonds', 'Quick recap'];

export function ExamPriorityExample() {
  const start = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }, []);
  const [exam, setExam] = useState(13);
  const [week, setWeek] = useState(1);
  const dates = Array.from({ length: 28 }, (_, day) => addDays(start, day));
  const select = (day: number) => {
    setExam(day);
    setWeek(Math.floor(day / 7));
  };
  // An illustrative sequence shows the interaction, not a generated learner forecast.
  const sessions = [6, 3, 1].map((offset, index) => ({
    day: Math.max(0, exam - offset),
    topic: topics[index],
    minutes: [15, 10, 5][index],
  }));

  return (
    <div className="exam-calendar">
      <div className="exam-calendar-toolbar">
        <label>
          Exam day
          <input
            type="date"
            aria-label="Exam day"
            min={dateKey(dates[1])}
            max={dateKey(dates[27])}
            value={dateKey(dates[exam])}
            onChange={(event) => {
              const day = dates.findIndex((date) => dateKey(date) === event.target.value);
              if (day > 0) select(day);
            }}
          />
        </label>
        <div className="exam-calendar-navigation">
          <button
            type="button"
            aria-label="Previous week"
            disabled={week === 0}
            onClick={() => setWeek(week - 1)}
          >
            ←
          </button>
          <span>
            {label(dates[week * 7])} – {label(dates[week * 7 + 6])}
          </span>
          <button
            type="button"
            aria-label="Next week"
            disabled={week === 3}
            onClick={() => setWeek(week + 1)}
          >
            →
          </button>
        </div>
      </div>
      <div
        className="exam-calendar-window"
        tabIndex={0}
        role="region"
        aria-label="Example revision calendar"
      >
        <div className="exam-calendar-canvas">
          <div className="exam-calendar-track" style={{ transform: `translateX(-${week * 25}%)` }}>
            {[0, 1, 2, 3].map((weekIndex) => (
              <div
                className="exam-calendar-week"
                key={weekIndex}
                ref={(element) => {
                  if (element) element.inert = weekIndex !== week;
                }}
                aria-hidden={weekIndex !== week}
              >
                {dates.slice(weekIndex * 7, weekIndex * 7 + 7).map((date, index) => {
                  const day = weekIndex * 7 + index;
                  return (
                    <div className="exam-calendar-day" key={day} data-exam={exam === day}>
                      <button
                        type="button"
                        disabled={day === 0}
                        aria-label={`Set exam for ${label(date)}`}
                        aria-pressed={exam === day}
                        onClick={() => select(day)}
                      >
                        <span>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <strong>{date.getDate()}</strong>
                      </button>
                      {exam === day && <div className="exam-calendar-deadline">Exam day</div>}
                    </div>
                  );
                })}
              </div>
            ))}
            {sessions.map((session, index) => (
              <div
                key={session.topic}
                className={`exam-calendar-session exam-calendar-session-${index}`}
                style={{ left: `${(session.day / 28) * 100}%`, top: `${138 + index * 66}px` }}
              >
                <strong>{session.topic}</strong>
                <span>{session.minutes} min</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="exam-calendar-footer">
        <span>Example schedule</span>
        <output aria-live="polite">Exam on {label(dates[exam])}</output>
      </div>
    </div>
  );
}
