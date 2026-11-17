import { useState } from 'react';
import { Frame, Opening } from './Frame';
import './almanac.css';

const weeks = ['8 June', '15 June', '22 June'];
export function Landing() {
  const [week, setWeek] = useState(1);
  const day = 8 + week * 7;
  return (
    <Frame
      edition="almanac"
      image="exam-date"
      alt="Setting a target assessment date in Lacuna"
      title="Work backwards from the paper."
      detail="Give a course an exam date. Lacuna models what you are likely to remember then and brings forward the cards where a review will make the most difference."
    >
      <Opening title="Put a date on revision.">
        Your exam is a fixed point. Lacuna builds a moving revision plan around it, one review at a
        time.
      </Opening>
      <figure className="almanac-sheet">
        <figcaption>
          Revision almanac <span>June 2026</span>
        </figcaption>
        <div className="almanac-dateline">
          <strong>{day}</strong>
          <div>
            Monday
            <br />
            Biology exam
          </div>
        </div>
        <div className="almanac-month" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} data-exam={i + 1 === day} data-before={i + 1 < day}>
              {i + 1}
            </span>
          ))}
        </div>
        <label>
          Example exam date
          <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {weeks.map((date, i) => (
              <option value={i} key={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
      </figure>
    </Frame>
  );
}
