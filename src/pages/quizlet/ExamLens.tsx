import { useState } from 'react';

export function ExamLens() {
  const [exam, setExam] = useState(true);
  return (
    <div className="qc-exam-lens">
      <div className="qc-exam-controls">
        <div className="qc-segmented">
          <button aria-pressed={exam} onClick={() => setExam(true)}>
            Exam date
          </button>
          <button aria-pressed={!exam} onClick={() => setExam(false)}>
            Steady retention
          </button>
        </div>
      </div>
      <div className="qc-exam-heading" aria-live="polite">
        <h3>{exam ? 'Ready for the day.' : 'Keep it for longer.'}</h3>
        <p>
          {exam ? 'Give your course an assessment date.' : 'Keep reviewing without a deadline.'}
        </p>
      </div>
      <div
        className="qc-review-timeline"
        aria-label={
          exam
            ? 'Illustration of reviews leading towards an exam'
            : 'Illustration of ongoing reviews'
        }
      >
        <svg viewBox="0 0 720 160" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M20 105C120 105 105 50 200 50S270 105 350 105 440 50 515 50 600 105 690 105"
            fill="none"
            stroke="hsl(var(--line-strong))"
            strokeWidth="2"
          />
          <path
            className="qc-timeline-draw"
            d="M20 105C120 105 105 50 200 50S270 105 350 105 440 50 515 50 600 105 690 105"
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="3"
          />
        </svg>
        {['Learn', 'Recall', 'Revisit', exam ? 'Exam day' : 'Keep going'].map((label, i) => (
          <div key={label} className={`qc-review-stop stop-${i}`}>
            <span>{i === 3 ? (exam ? '15' : '∞') : `0${i + 1}`}</span>
            <b>{label}</b>
            {i === 3 && <small>{exam ? 'June · example' : 'Your own pace'}</small>}
          </div>
        ))}
      </div>
      <div className="qc-exam-bottom">
        <p>
          {exam
            ? 'Review priorities work towards recall on your assessment date.'
            : 'Review intervals adapt to your card history over time.'}
        </p>
        <small>Concept illustration, not a generated timetable or recall prediction.</small>
      </div>
    </div>
  );
}
