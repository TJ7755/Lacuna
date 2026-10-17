import type { ReactNode } from 'react';
import './LandingFeatures.css';

function Feature({
  id,
  title,
  children,
  visual,
}: {
  id: string;
  title: string;
  children: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`landing-feature${visual ? '' : ' landing-feature-centred'}`}
      aria-labelledby={`${id}-title`}
      tabIndex={id === 'how-it-works' ? -1 : undefined}
    >
      <div className="landing-feature-copy">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{children}</p>
      </div>
      {visual && (
        <div className="landing-feature-visual" aria-hidden="true">
          {visual}
        </div>
      )}
    </section>
  );
}

function ExamSchedule() {
  return (
    <div className="landing-schedule">
      <div className="landing-due-queue">
        <div className="landing-exam-marker">
          <span>Exam</span>
        </div>
        {['1d', '4d', '11d', '1mo', '3mo'].map((interval, index) => (
          <div className="landing-due-row" key={interval}>
            <span className="landing-due-text" />
            <span className="landing-interval" style={{ left: `${28 + index * 14}%` }}>
              {interval}
            </span>
          </div>
        ))}
      </div>
      <div className="landing-forecast">
        <div className="landing-exam-marker">
          <span>Exam</span>
        </div>
        <svg viewBox="0 0 260 250" fill="none" focusable="false" preserveAspectRatio="none">
          <path d="M12 220H230" className="landing-chart-axis" vectorEffect="non-scaling-stroke" />
          <path
            d="M12 50H230"
            className="landing-chart-target"
            strokeWidth="1.2"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M12 213C44 210 56 186 80 165S112 145 138 118S184 96 208 77S222 69 230 62"
            className="landing-chart-line"
            strokeWidth="3.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </svg>
        <span className="landing-chart-dot" />
        <span className="landing-chart-value">78%</span>
      </div>
    </div>
  );
}

function LearnCard() {
  return (
    <div className="landing-learn">
      <div className="landing-learn-card">la bibliothèque</div>
      <div className="landing-learn-actions">
        <span>No</span>
        <span>Yes</span>
      </div>
    </div>
  );
}

function MarkedQuestion() {
  return (
    <div className="landing-question">
      <div className="landing-question-prompt">Describe osmosis.</div>
      <div className="landing-question-answer">
        <div>Water crosses a membrane.</div>
        <div>It is partially permeable.</div>
      </div>
      <ul className="landing-mark-scheme">
        {[
          'Water molecules move',
          'Partially permeable membrane',
          'Dilute to concentrated solution',
        ].map((line, index) => (
          <li key={line} data-awarded={index < 2}>
            <svg viewBox="0 0 20 20" fill="none" focusable="false">
              {index < 2 ? (
                <path
                  d="m4 10 4 4 8-9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.2" />
              )}
            </svg>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="landing-question-score">2/3</div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <>
      <Feature
        id="how-it-works"
        title="Scheduled for your exam, not for ever."
        visual={<ExamSchedule />}
      >
        Most flashcard apps space reviews out indefinitely. Lacuna simulates every card forward to
        your exam date and reviews whatever raises that day&apos;s score most.
      </Feature>
      <Feature
        id="landing-forecast"
        title="One number, and it means something."
        visual={<div className="landing-forecast-number">84%</div>}
      >
        The forecast is what Lacuna optimises. If it says 84%, that is how much it expects you to
        recall on the day.
      </Feature>
      <Feature
        id="landing-grading"
        title="Did you know it? That's the whole question."
        visual={<LearnCard />}
      >
        Answer Yes or No. Lacuna works out how well you knew it from how quickly you answered.
      </Feature>
      <Feature
        id="landing-questions"
        title="Practise the exam, not just the facts."
        visual={<MarkedQuestion />}
      >
        Write answers to exam questions. Lacuna marks them against the mark scheme and schedules
        them alongside your cards.
      </Feature>
      <Feature id="landing-privacy" title="Yours, on your device.">
        No account. Everything stays on your device, with backups to a file and optional encrypted
        sync.
      </Feature>
    </>
  );
}
