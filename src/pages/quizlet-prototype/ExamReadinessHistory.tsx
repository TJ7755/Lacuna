import { useState } from 'react';
import {
  EXAMPLE_NOW,
  EXAMPLE_START,
  exampleHistories,
  forecastExample,
  type RecallPoint,
} from './examReadinessModel';
import { MS_PER_DAY } from '../../fsrs/params';

const percent = (value: number) => Math.round(value * 100);

export function ExamReadinessHistory() {
  const [days, setDays] = useState(21);
  const [selected, setSelected] = useState(exampleHistories[0].card.id);
  const ranked = exampleHistories
    .map((example) => forecastExample(example, days))
    .sort((a, b) => b.gain - a.gain);
  const current = ranked.find(({ card }) => card.id === selected)!;
  const exam = EXAMPLE_NOW + days * MS_PER_DAY;
  const x = (at: number) => 43 + ((at - EXAMPLE_START) / (exam - EXAMPLE_START)) * 455;
  const y = (recall: number) => 203 - recall * 160;
  const path = (points: RecallPoint[]) =>
    points
      .map((point, i) => `${i ? 'L' : 'M'}${x(point.at).toFixed(2)} ${y(point.recall).toFixed(2)}`)
      .join(' ');
  return (
    <div className="qc-readiness">
      <div className="qc-readiness-date">
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true">
          <rect x="4" y="7" width="24" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 14h24M10 3v8M22 3v8m-11 10 4 4 7-7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <label htmlFor="qc-example-exam">Exam day</label>
        <select
          id="qc-example-exam"
          aria-label="Example exam date"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value="7">In 7 days</option>
          <option value="21">In 21 days</option>
          <option value="42">In 42 days</option>
        </select>
      </div>
      <div className="qc-readiness-chart">
        <div className="qc-recall-key">
          <span>
            <i />
            With today’s review
          </span>
          <span>
            <i />
            Skip today’s review
          </span>
        </div>
        <svg
          viewBox="0 0 570 265"
          role="img"
          aria-label={`Predicted recall for ${selected} on exam day in ${days} days: ${percent(current.before)}% without another review, ${percent(current.after)}% after a successful review today.`}
        >
          <text x="32" y="19" className="qc-chart-axis">
            Predicted card recall
          </text>
          {[0, 0.5, 1].map((value) => (
            <g key={value}>
              <path d={`M43 ${y(value)}H498`} className="qc-chart-grid" />
              <text x="35" y={y(value) + 4} textAnchor="end" className="qc-chart-axis">
                {percent(value)}%
              </text>
            </g>
          ))}
          <rect
            x={x(EXAMPLE_NOW)}
            y="35"
            width={498 - x(EXAMPLE_NOW)}
            height="168"
            className="qc-forecast-area"
          />
          <path d={`M${x(EXAMPLE_NOW)} 35V210`} className="qc-today-line" />
          <path d={path(current.history)} className="qc-recall-history" />
          {exampleHistories
            .find(({ card }) => card.id === selected)!
            .reviews.map((review) => (
              <circle
                key={review.lastReviewed}
                cx={x(review.lastReviewed!)}
                cy={y(1)}
                r="3"
                className="qc-recall-point"
              >
                <title>
                  Example review {Math.round((EXAMPLE_NOW - review.lastReviewed!) / MS_PER_DAY)}{' '}
                  days ago
                </title>
              </circle>
            ))}
          <path d="M498 28V210" className="qc-exam-line" />
          <path d={path(current.unreviewed)} className="qc-recall-without" />
          <path
            key={`${days}-${selected}`}
            d={path(current.reviewed)}
            className="qc-recall-with"
            pathLength="1"
          />
          <circle cx="498" cy={y(current.after)} r="6" className="qc-recall-point" />
          <circle cx="498" cy={y(current.before)} r="4" className="qc-recall-point-muted" />
          <text
            x="510"
            y={Math.min(y(current.after) + 5, y(current.before) - 12)}
            className="qc-chart-value"
          >
            {percent(current.after)}%
          </text>
          <text x="510" y={y(current.before) + 5} className="qc-chart-value-muted">
            {percent(current.before)}%
          </text>
          <text x="43" y="224" className="qc-chart-axis">
            14 days ago
          </text>
          <text x={x(EXAMPLE_NOW)} y="242" textAnchor="middle" className="qc-chart-axis">
            Review today
          </text>
          <text x="498" y="224" textAnchor="middle" className="qc-chart-exam">
            Exam day
          </text>
        </svg>
      </div>
      <div className="qc-readiness-queue" aria-label="Example review priorities">
        {ranked.map(({ card, gain }, i) => (
          <button
            key={card.id}
            aria-pressed={selected === card.id}
            onClick={() => setSelected(card.id)}
          >
            <span>{card.front}</span>
            <span className="qc-gain-track">
              <i style={{ width: `${Math.max(4, gain * 250)}%` }} />
            </span>
            <b>+{percent(gain)} pts</b>
            <span className="qc-queue-order">{i === 0 ? 'Review first' : 'Later'}</span>
          </button>
        ))}
      </div>
      <details className="qc-readiness-method">
        <summary>How these example predictions work</summary>
        <p>
          Example reviews took place 14, 13 and 7 days ago. The solid history and future curves use
          Lacuna’s FSRS-6 model: recall falls between reviews, and each review updates memory
          stability. The shaded region is a projection, assuming no reviews after today. The
          increase is predicted exam-day recall after a successful review today. In the default exam
          mode, eligible cards with the greatest predicted gain take priority. Your answers update
          the estimates; these are not predicted exam marks.
        </p>
      </details>
    </div>
  );
}
