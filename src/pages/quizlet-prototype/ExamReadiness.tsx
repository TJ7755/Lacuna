import { useState } from 'react';
import type { Card } from '../../db/types';
import { makeEngine } from '../../fsrs/fsrs';
import { rAtExam, rAtExamIfReviewedNow, simContext } from '../../fsrs/forwardSim';
import { defaultFsrsParameters, MS_PER_DAY } from '../../fsrs/params';

const now = Date.UTC(2027, 4, 25);
const fsrsParameters = defaultFsrsParameters();
const context = simContext(
  { id: 'example', examObjective: 'expectedMarks', fsrsParameters },
  makeEngine(fsrsParameters),
);
const examples: Card[] = [
  ['Enzymes', 4, 5],
  ['Cell structure', 18, 3],
  ['Diffusion', 45, 2],
].map(([name, stability, elapsed]) => ({
  id: String(name),
  conceptId: String(name),
  deckId: 'example',
  schedulingUnitId: 'example',
  type: 'front_back',
  front: String(name),
  back: '',
  stability: Number(stability),
  difficulty: 5,
  lastReviewed: now - Number(elapsed) * MS_PER_DAY,
  reps: 4,
  lapses: 0,
  state: 2,
  due: now,
  scheduledDays: Number(elapsed),
  learningSteps: 0,
  history: [],
  createdAt: now,
  updatedAt: now,
}));
const percent = (value: number) => Math.round(value * 100);

export function ExamReadiness() {
  const [days, setDays] = useState(21);
  const [selected, setSelected] = useState(examples[0].id);
  const exam = now + days * MS_PER_DAY;
  const ranked = examples
    .map((card) => {
      const before = rAtExam(card, exam, now, context.decay);
      const after = rAtExamIfReviewedNow(card, 3, exam, now, context);
      return { card, before, after, gain: after - before };
    })
    .sort((a, b) => b.gain - a.gain);
  const current = ranked.find(({ card }) => card.id === selected)!;
  const x = (day: number) => 32 + (day / days) * 470;
  const y = (recall: number) => 205 - recall * 165;
  function curve(reviewed: boolean) {
    return Array.from({ length: 41 }, (_, i) => {
      const day = (i / 40) * days;
      const at = now + day * MS_PER_DAY;
      const recall = reviewed
        ? rAtExamIfReviewedNow(current.card, 3, at, now, context)
        : rAtExam(current.card, at, now, context.decay);
      return `${i ? 'L' : 'M'}${x(day).toFixed(2)} ${y(recall).toFixed(2)}`;
    }).join(' ');
  }
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
            After a successful review today
          </span>
          <span>
            <i />
            Without another review
          </span>
        </div>
        <svg
          viewBox="0 0 570 250"
          role="img"
          aria-label={`Predicted recall for ${selected} on exam day in ${days} days: ${percent(current.before)}% without another review, ${percent(current.after)}% after a successful review today.`}
        >
          <text x="32" y="19" className="qc-chart-axis">
            Predicted card recall
          </text>
          {[0.25, 0.5, 0.75, 1].map((value) => (
            <path key={value} d={`M32 ${y(value)}H502`} className="qc-chart-grid" />
          ))}
          <path d="M502 28V218" className="qc-exam-line" />
          <path d={curve(false)} className="qc-recall-without" />
          <path
            key={`${days}-${selected}`}
            d={curve(true)}
            className="qc-recall-with"
            pathLength="1"
          />
          <circle cx="502" cy={y(current.after)} r="6" className="qc-recall-point" />
          <circle cx="502" cy={y(current.before)} r="4" className="qc-recall-point-muted" />
          <text
            x="516"
            y={Math.min(y(current.after) + 5, y(current.before) - 12)}
            className="qc-chart-value"
          >
            {percent(current.after)}%
          </text>
          <text x="516" y={y(current.before) + 5} className="qc-chart-value-muted">
            {percent(current.before)}%
          </text>
          <text x="32" y="241" className="qc-chart-axis">
            Today
          </text>
          <text x="502" y="241" textAnchor="middle" className="qc-chart-exam">
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
          These example cards use Lacuna’s FSRS-6 model. The increase is predicted exam-day recall
          after a successful review today. In the default exam mode, eligible cards with the
          greatest predicted gain take priority. Your answers update the estimates; these are not
          predicted exam marks.
        </p>
      </details>
    </div>
  );
}

export function ExamSteps() {
  return (
    <ol className="qc-exam-steps">
      <li>
        <strong>Set your exam date.</strong>
        <span>Lacuna predicts what you’ll recall on that day.</span>
      </li>
      <li>
        <strong>Review where it helps most.</strong>
        <span>Cards with more to gain take priority.</span>
      </li>
      <li>
        <strong>Answer. Adapt. Repeat.</strong>
        <span>Each answer updates your memory model.</span>
      </li>
    </ol>
  );
}
