import { useState } from 'react';
import { Rating } from 'ts-fsrs';
import { makeEngine } from '../../fsrs/fsrs';
import { defaultFsrsParameters } from '../../fsrs/params';
import './ExamPriorityExample.css';

const engine = makeEngine({ ...defaultFsrsParameters(), enable_fuzz: false });
// Representative cards illustrate recall gains, not a learner's actual revision plan.
const cards = [
  { topic: 'Cell division', stability: 0.5, difficulty: 8, elapsed: 3 },
  { topic: 'Chemical bonds', stability: 4, difficulty: 2, elapsed: 7 },
];

export function ExamPriorityExample() {
  const [days, setDays] = useState(14);
  const priorities = cards
    .map((card) => {
      const without = engine.forgetting_curve(card.elapsed + days, card.stability);
      const reviewed = engine.next_state(card, card.elapsed, Rating.Good);
      const withReview = engine.forgetting_curve(days, reviewed.stability);
      return { topic: card.topic, gain: Math.round((withReview - without) * 100) };
    })
    .sort((a, b) => b.gain - a.gain);

  return (
    <div className="exam-priority-example">
      <label htmlFor="example-exam-date">
        Exam in <output htmlFor="example-exam-date">{days} days</output>
      </label>
      <input
        id="example-exam-date"
        type="range"
        min="3"
        max="42"
        value={days}
        aria-label="Exam in"
        aria-valuetext={`${days} days`}
        onChange={(event) => setDays(Number(event.target.value))}
      />
      <div className="exam-priority-result" aria-live="polite" aria-atomic="true">
        {priorities.map((card, index) => (
          <div className="exam-priority-row" key={card.topic}>
            <span className="exam-priority-rank">{index + 1}</span>
            <span>{card.topic}</span>
            <strong>
              +{card.gain}
              <small> pts</small>
            </strong>
          </div>
        ))}
      </div>
      <span className="exam-priority-note">
        Extra recall on exam day from one successful review today. Illustrative cards.
      </span>
    </div>
  );
}
