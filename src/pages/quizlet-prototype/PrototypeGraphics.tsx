import { useState, type CSSProperties } from 'react';
import { LacunaIcon } from '../../components/ui/icons';

export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Calendar({ condensed = false }: { condensed?: boolean }) {
  const [week, setWeek] = useState(0);
  return (
    <div className={`qp-calendar ${condensed ? 'qp-calendar-small' : ''}`}>
      <div className="qp-card-top">
        <span>YOUR REVISION, IN VIEW</span>
        <span className="qp-live">Example plan</span>
      </div>
      <div className="qp-calendar-heading">
        <div>
          <small>Biology · Exam day</small>
          <h3>15 June</h3>
        </div>
        <div className="qp-count">
          <strong>{42 - week * 7}</strong>
          <span>days to go</span>
        </div>
      </div>
      <div className="qp-weekdays">
        {'MTWTFSS'.split('').map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="qp-days" key={week}>
        {Array.from({ length: 28 }, (_, i) => (
          <div
            key={i}
            className={`${i % 7 === 5 ? 'rest' : ''} ${i === 0 ? 'exam' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            <span>{((i + 3 + week * 7) % 31) + 1}</span>
            {i === 0 ? (
              <b>START</b>
            ) : i % 7 !== 5 ? (
              <i style={{ '--fill': `${25 + ((i * 19 + week * 11) % 65)}%` } as CSSProperties} />
            ) : (
              <small>Rest</small>
            )}
          </div>
        ))}
      </div>
      <div className="qp-week-control">
        <span>Four weeks in view</span>
        <div>
          {[0, 1, 2].map((i) => (
            <button key={i} aria-pressed={week === i} onClick={() => setWeek(i)}>
              Week {i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="qp-calendar-footer">
        <span className="qp-dot" /> Time for revision. Room for life.
      </div>
    </div>
  );
}

export function RecallGraphic() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="qp-recall-graphic">
      <div className="qp-orbit qp-orbit-one" />
      <div className="qp-orbit qp-orbit-two" />
      <span className="qp-orbit-tag">Recall</span>
      <span className="qp-orbit-tag second">Revisit</span>
      <button
        className={`qp-flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
        aria-label="Flip example flashcard"
      >
        <span>BIOLOGY / 01</span>
        <strong>{flipped ? 'The mitochondrion.' : 'Where does aerobic respiration happen?'}</strong>
        <small>{flipped ? 'Answer revealed · tap to return' : 'Tap to reveal'}</small>
      </button>
      <span className="qp-graphic-caption">A familiar starting point.</span>
    </div>
  );
}
export function PathGraphic() {
  return (
    <div className="qp-path-graphic">
      <svg viewBox="0 0 420 240" fill="none" aria-hidden="true">
        <path className="qp-track" d="M45 175C110 175 75 65 145 65S205 175 270 175 335 65 375 65" />
        <path
          className="qp-track qp-track-active"
          d="M45 175C110 175 75 65 145 65S205 175 270 175 335 65 375 65"
        />
        {[
          [45, 175],
          [145, 65],
          [270, 175],
          [375, 65],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r="23"
              fill="hsl(var(--surface))"
              stroke="hsl(var(--accent))"
              strokeWidth="2"
            />
            <text x={x} y={y + 5} textAnchor="middle" fill="hsl(var(--ink))" fontSize="14">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <span className="qp-path-label p1">Understand</span>
      <span className="qp-path-label p2">Recall</span>
      <span className="qp-path-label p3">Apply</span>
      <span className="qp-path-label p4">Revisit</span>
      <div className="qp-path-target">
        <span className="qp-dot" /> One course. A connected path.
      </div>
    </div>
  );
}

const steps = [
  { name: 'Understand', label: 'A little context goes a long way.', kind: 'LESSON NOTES' },
  { name: 'Recall', label: 'Bring it back from memory.', kind: 'RECALL CARD' },
  { name: 'Apply', label: 'Put your knowledge to work.', kind: 'APPLICATION QUESTION' },
  { name: 'Revisit', label: 'Make room for another look.', kind: 'SCHEDULED PRACTICE' },
];
export function CourseDemo() {
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="qp-course-demo">
      <div className="qp-demo-sidebar">
        <div className="qp-demo-brand">
          <LacunaIcon />
          <span>
            Biology<small>Your course</small>
          </span>
        </div>
        <div className="qp-demo-steps">
          {steps.map((item, i) => (
            <button
              key={item.name}
              onClick={() => {
                setStep(i);
                setRevealed(false);
              }}
              aria-pressed={step === i}
            >
              <span>0{i + 1}</span>
              <div>
                {item.name}
                <small>
                  {
                    [
                      'Build the foundation',
                      'Test your memory',
                      'Connect the ideas',
                      'Keep it with you',
                    ][i]
                  }
                </small>
              </div>
              <Arrow />
            </button>
          ))}
        </div>
        <div className="qp-demo-exam">
          <small>NEXT EXAM</small>
          <strong>15 June</strong>
          <span>One course. Four ways forward.</span>
        </div>
      </div>
      <div className="qp-demo-content">
        <div className="qp-card-top">
          <span>ENZYMES</span>
          <span>Illustrative walkthrough</span>
        </div>
        <div className="qp-demo-scene" key={step}>
          <span className="qp-kicker">{steps[step].kind}</span>
          <h3>{steps[step].label}</h3>
          {step === 0 && (
            <>
              <svg
                className="qp-enzyme"
                viewBox="0 0 400 180"
                aria-label="Illustration of a substrate fitting an enzyme"
              >
                <path
                  d="M110 145C25 145 22 42 90 30C140 12 192 43 191 80L154 80L137 106L158 129L191 125C181 147 142 156 110 145Z"
                  fill="hsl(var(--accent))"
                />
                <g className="qp-substrate">
                  <path
                    d="M235 66L270 66L286 92L269 116L234 113L218 91Z"
                    fill="hsl(var(--accent-soft))"
                    stroke="hsl(var(--accent-ink))"
                    strokeWidth="2"
                  />
                </g>
                <path
                  d="M310 90h55m-9-9 9 9-9 9"
                  stroke="hsl(var(--ink-soft))"
                  fill="none"
                  strokeWidth="2"
                />
              </svg>
              <div className="qp-note-line">
                <b>A specific fit.</b>
                <p>The substrate binds to the enzyme’s active site.</p>
              </div>
            </>
          )}
          {step === 1 && (
            <button className="qp-demo-question" onClick={() => setRevealed(!revealed)}>
              <span>What is an enzyme’s active site?</span>
              <strong>
                {revealed ? 'The region where the substrate binds.' : 'Think first. Then reveal.'}
              </strong>
              <small>{revealed ? 'Tap to hide answer' : 'Tap to reveal answer'}</small>
            </button>
          )}
          {step === 2 && (
            <div className="qp-apply">
              <svg viewBox="0 0 360 140" aria-label="Illustrative enzyme activity curve">
                <path d="M20 10v110h320" stroke="hsl(var(--line-strong))" fill="none" />
                <path
                  className="qp-curve"
                  d="M25 115C100 112 150 30 220 20C245 20 250 112 330 116"
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="5"
                />
              </svg>
              <h4>Why does temperature change enzyme activity?</h4>
              <button className="qp-text-button" onClick={() => setRevealed(!revealed)}>
                {revealed ? 'Hide explanation' : 'Show explanation'} <Arrow />
              </button>
              {revealed && (
                <p>
                  Warming increases molecular collisions; high temperatures can change the active
                  site’s shape.
                </p>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="qp-revisit">
              <div className="qp-review-bars">
                {[38, 70, 48, 92, 58, 36, 64].map((height, i) => (
                  <div key={i}>
                    <i style={{ height: `${height}%`, '--i': i } as CSSProperties} />
                    <span>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                  </div>
                ))}
              </div>
              <b>Recall today. Revisit over time.</b>
              <p>FSRS-6 schedules cards from your review history.</p>
            </div>
          )}
        </div>
        <div className="qp-demo-bottom">
          <span>0{step + 1} / 04</span>
          <button
            onClick={() => {
              setStep((step + 1) % 4);
              setRevealed(false);
            }}
          >
            Next step <Arrow />
          </button>
        </div>
      </div>
    </div>
  );
}
