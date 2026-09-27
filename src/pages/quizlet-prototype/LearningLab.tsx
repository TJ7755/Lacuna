import { useState } from 'react';
import { Arrow } from './PrototypeUi';

const modes = ['Recall', 'Cloze', 'Image labels', 'Sequence', 'Application'] as const;
type Mode = (typeof modes)[number];
export function LearningLab() {
  const [mode, setMode] = useState<Mode>('Recall');
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState('');
  const [checked, setChecked] = useState(false);
  const [ordered, setOrdered] = useState<string[]>([]);
  const sequence = ['Substrate binds', 'Reaction occurs', 'Products leave'];
  const chooseMode = (next: Mode) => {
    setMode(next);
    setRevealed(false);
    setChecked(false);
    setChoice('');
    setOrdered([]);
  };
  return (
    <div className="qc-learning-lab">
      <div className="qc-lab-navigation">
        <div>
          <h3>
            One idea.
            <br />
            Five ways in.
          </h3>
        </div>
        <div className="qc-lab-modes" aria-label="Practice examples">
          {modes.map((item) => (
            <button
              key={item}
              aria-label={item}
              aria-pressed={mode === item}
              onClick={() => chooseMode(item)}
            >
              {item}
              <Arrow />
            </button>
          ))}
        </div>
      </div>
      <div className="qc-lab-stage">
        <div className="qc-lab-content" key={mode}>
          {mode === 'Recall' && (
            <>
              <h4>
                What does an
                <br />
                enzyme do?
              </h4>
              <div className={`qc-answer ${revealed ? 'qc-answer-shown' : ''}`}>
                {revealed
                  ? 'It catalyses a reaction by lowering the activation energy.'
                  : 'Think of your answer before revealing it.'}
              </div>
              <button className="qc-button" onClick={() => setRevealed(!revealed)}>
                {revealed ? 'Hide answer' : 'Reveal answer'}
                <Arrow />
              </button>
            </>
          )}
          {mode === 'Cloze' && (
            <>
              <h4>
                Enzymes lower
                <br />
                the{' '}
                <button
                  className="qc-cloze"
                  onClick={() => setRevealed(!revealed)}
                  aria-label="Reveal missing phrase"
                >
                  {revealed ? 'activation energy' : '[ … ]'}
                </button>
                <br />
                of a reaction.
              </h4>
              <p>Tap the gap to check your recall.</p>
            </>
          )}
          {mode === 'Image labels' && (
            <>
              <svg
                className="qc-enzyme"
                viewBox="0 0 500 245"
                role="img"
                aria-label="An enzyme with an indented active site and a matching substrate"
              >
                <path
                  d="M180 201C55 216 40 57 135 33C213 13 272 61 266 101L222 101L201 132L224 165L266 160C254 196 219 206 180 201Z"
                  fill="hsl(var(--accent))"
                />
                <path
                  className="qc-substrate"
                  d="M353 100h42l22 31-22 32h-42l-21-32Z"
                  fill="hsl(var(--accent-soft))"
                  stroke="hsl(var(--accent-ink))"
                  strokeWidth="2"
                />
                <path d="M220 132h92" stroke="hsl(var(--ink))" strokeDasharray="3 5" />
                <circle cx="220" cy="132" r="4" fill="hsl(var(--ink))" />
              </svg>
              <button className="qc-outline-button" onClick={() => setRevealed(!revealed)}>
                {revealed ? 'Active site' : 'Reveal the label'}
                <Arrow />
              </button>
              <p>Cover a label. Retrieve the name.</p>
            </>
          )}
          {mode === 'Sequence' && (
            <>
              <h4>
                How does an
                <br />
                enzyme work?
              </h4>
              <div className="qc-sequence-slots">
                {sequence.map((_, i) => (
                  <div key={i}>
                    <span>0{i + 1}</span>
                    {ordered[i] ?? 'Choose a step below'}
                  </div>
                ))}
              </div>
              <div className="qc-sequence-choices">
                {[sequence[2], sequence[0], sequence[1]].map((step) => (
                  <button
                    key={step}
                    disabled={ordered.includes(step)}
                    onClick={() => setOrdered([...ordered, step])}
                  >
                    {step} +
                  </button>
                ))}
              </div>
              {ordered.length === 3 && (
                <p role="status">
                  {ordered.every((step, i) => step === sequence[i])
                    ? 'Correct. Binding, reaction, release.'
                    : 'Start with the substrate binding to the active site.'}
                </p>
              )}
              <button className="qc-text-button" onClick={() => setOrdered([])}>
                Reset sequence
              </button>
            </>
          )}
          {mode === 'Application' && (
            <>
              <h4>Why can high temperatures stop an enzyme working?</h4>
              <div className="qc-answers" role="radiogroup" aria-label="Enzyme application answer">
                {[
                  'The active site changes shape',
                  'The enzyme runs out of energy',
                  'Every collision stops',
                ].map((answer) => (
                  <label key={answer} className={choice === answer ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="enzyme-answer"
                      value={answer}
                      checked={choice === answer}
                      onChange={() => {
                        setChoice(answer);
                        setChecked(false);
                      }}
                    />
                    <span>{answer}</span>
                  </label>
                ))}
              </div>
              <button className="qc-button" onClick={() => setChecked(true)}>
                Check my answer
                <Arrow />
              </button>
              {checked && (
                <p className="qc-answer-feedback" role="status">
                  {!choice
                    ? 'Choose an answer first.'
                    : choice === 'The active site changes shape'
                      ? 'Correct. High temperatures can denature the enzyme, changing the active site so the substrate no longer fits.'
                      : 'Look at the active site. High temperatures can change its shape, preventing the substrate from binding.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
