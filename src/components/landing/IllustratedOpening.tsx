import { useState } from 'react';
import { StudyIllustration } from './StudyIllustration';
import './IllustratedOpening.css';

const emphases = ['subject', 'time', 'exam'] as const;

export function IllustratedOpening() {
  const [emphasis, setEmphasis] = useState<(typeof emphases)[number]>('subject');
  return (
    <section
      className="illustrated-opening"
      aria-label="Revision around your exam"
      data-emphasis={emphasis}
    >
      <h1 className="opening-title">
        {emphases.map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={emphasis === item}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') setEmphasis(item);
            }}
            onFocus={() => setEmphasis(item)}
            onClick={() => setEmphasis(item)}
          >
            Your {item}.
          </button>
        ))}
      </h1>
      <p className="opening-description">Revision that brings it all together.</p>
      <div className="opening-composition">
        <StudyIllustration />
        <div className="opening-dashboard">
          <img
            src={`${import.meta.env.BASE_URL}landing/study-plan.png`}
            width="1280"
            height="800"
            alt="Lacuna dashboard showing the welcome course and daily revision"
            fetchPriority="high"
          />
        </div>
      </div>
    </section>
  );
}
