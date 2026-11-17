import { useState } from 'react';
import { Frame, Opening } from './Frame';
import './specimen.css';

// Draw the paired pinnae along one rachis. Each leaflet tapers towards the tip.
function Frond() {
  return (
    <svg className="specimen-frond" viewBox="0 0 400 490" aria-hidden="true">
      <defs>
        <g id="specimen-pinna">
          <path d="M0 0 Q60 -4 100 -20 Q50 -2 0 2Z" />
          {Array.from({ length: 14 }, (_, n) => {
            const tip = 2 + 15 * Math.sin((Math.PI * (n + 1)) / 16);
            return (
              <path
                key={n}
                transform={`translate(${(n * 100) / 14} ${-20 * (n / 14) ** 1.6})`}
                d={`M0 0 q3 -${tip} 13 -${tip + 5} Q10 -4 0 0 q8 1 14 ${tip * 0.6} Q4 ${tip * 0.7} 0 0Z`}
              />
            );
          })}
        </g>
      </defs>
      <g transform="rotate(21 200 245)" fill="currentColor">
        <path d="M197 476 Q204 190 200 21 Q211 215 204 476Z" />
        {Array.from({ length: 20 }, (_, row) => {
          const y = 40 + row * 19;
          const scale = (18 + 114 * Math.sin((Math.PI * (row + 1)) / 23)) / 100;
          return [-1, 1].map((side) => (
            <use
              key={side}
              href="#specimen-pinna"
              transform={`translate(203 ${y}) scale(${side} 1) rotate(-24) scale(${scale} 1)`}
            />
          ));
        })}
      </g>
    </svg>
  );
}
export function Landing() {
  const [revealed, setRevealed] = useState(false);
  return (
    <Frame
      edition="specimen"
      image="revision"
      alt="A recall question in Lacuna’s study view"
      title="Give the answer a moment."
      detail="Work through a card, then say whether you knew it. Lacuna uses your answer and response time to decide when another review will help."
    >
      <figure className="specimen-plate">
        <Frond />
        <figcaption>
          <i>Dryopteris filix-mas</i>
          <span>Male fern</span>
        </figcaption>
      </figure>
      <div>
        <Opening title="What stays in memory?">
          Meet Lacuna, a revision notebook that brings each question back in time for your exam.
        </Opening>
        <div className="specimen-question">
          <p>What do ferns produce instead of seeds?</p>
          <button aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>
            {revealed ? 'Cover answer' : 'Reveal answer'}
          </button>
          {revealed && (
            <p className="specimen-answer">
              Spores, formed in sporangia on the underside of fertile fronds.
            </p>
          )}
        </div>
      </div>
    </Frame>
  );
}
