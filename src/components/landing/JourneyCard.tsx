import { useId, useState, type CSSProperties } from 'react';

export function JourneyCard({
  question,
  answer,
  automaticallyRevealed,
}: {
  question: string;
  answer: string;
  automaticallyRevealed: boolean;
}) {
  const [manualReveal, setManualReveal] = useState<boolean | null>(null);
  const answerId = useId();
  const revealed = manualReveal ?? automaticallyRevealed;

  return (
    <button
      type="button"
      className="journey-card"
      data-flippable="true"
      data-manual={manualReveal !== null}
      aria-label={question}
      aria-pressed={revealed}
      aria-describedby={revealed ? answerId : undefined}
      style={manualReveal === null ? undefined : {
        '--answer-reveal': manualReveal ? 1 : 0,
      } as CSSProperties}
      onClick={() => setManualReveal(!revealed)}
    >
      <span className="journey-card-turn">
        <span className="journey-card-face" aria-hidden={revealed}>
          <span>{question}</span>
        </span>
        <span className="journey-card-face journey-answer" aria-hidden={!revealed} id={answerId}>
          <span>{answer}</span>
        </span>
      </span>
    </button>
  );
}
