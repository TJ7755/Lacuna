import { useState } from 'react';
import { Frame, Opening } from './Frame';
import './interval.css';

export function Landing() {
  const [minutes, setMinutes] = useState(20);
  return (
    <Frame
      edition="interval"
      image="study-budget"
      alt="The daily study budget settings in Lacuna"
      title="Decide what fits today."
      detail="Set a daily study budget and an exam date. Lacuna prioritises reviews by their expected benefit on exam day so the most valuable work comes first."
    >
      <div className="interval-dial">
        <svg viewBox="0 0 320 320" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <path
              key={i}
              transform={`rotate(${i * 6} 160 160)`}
              d={i % 5 === 0 ? 'M160 9v24' : 'M160 9v12'}
              stroke={i < minutes ? '#ffd698' : '#74958c'}
              strokeWidth={i % 5 === 0 ? 4 : 2}
            />
          ))}
          <circle cx="160" cy="160" r="116" fill="none" stroke="#73978d" />
          <g transform={`rotate(${minutes * 6} 160 160)`}>
            <path d="m160 29 -6 14 h12z" fill="#ffd698" />
          </g>
        </svg>
        <div>
          <output htmlFor="session-budget">{minutes}</output>
          <span>minutes a day</span>
        </div>
      </div>
      <div>
        <Opening title="How long have you got?">
          Set the time you can spare. Lacuna puts the revision most likely to count on exam day at
          the front of the queue.
        </Opening>
        <div className="interval-budget">
          <label htmlFor="session-budget">Try a daily budget</label>
          <input
            id="session-budget"
            type="range"
            min="5"
            max="60"
            step="5"
            value={minutes}
            aria-valuetext={`${minutes} minutes`}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
          <div>
            <span>5 min</span>
            <span>60 min</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
