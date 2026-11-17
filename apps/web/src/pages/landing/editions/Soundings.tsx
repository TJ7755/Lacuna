import { useState } from 'react';
import { Frame, Opening } from './Frame';
import './soundings.css';

const traces = [
  { label: 'First review', value: 54, peaks: [0.15] },
  { label: 'Second review', value: 72, peaks: [0.15, 0.49] },
  { label: 'Third review', value: 84, peaks: [0.15, 0.49, 0.77] },
];
function Trace({ stage }: { stage: number }) {
  const peaks = traces[stage].peaks;
  return (
    <svg viewBox="0 0 900 290" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 36 }, (_, line) => {
        const points = Array.from({ length: 181 }, (_, i) => {
          const t = i / 180;
          const ridge = peaks.reduce(
            (sum, p) => sum + Math.exp(-((t - p - (line / 35) * 0.045) ** 2) / 0.0027),
            0,
          );
          const y =
            80 +
            line * 4.2 -
            ridge * (46 + 24 * Math.sin(line / 13)) +
            10 * Math.sin(t * 10 + line * 0.08);
          return `${i === 0 ? 'M' : 'L'}${i * 5} ${y.toFixed(2)}`;
        }).join(' ');
        return (
          <path
            key={line}
            d={points + ' L900 290 H0 Z'}
            fill="var(--paper)"
            stroke="currentColor"
            strokeWidth="1.65"
          />
        );
      })}
    </svg>
  );
}
export function Landing() {
  const [stage, setStage] = useState(2);
  return (
    <Frame
      edition="soundings"
      image="study-plan"
      alt="A course dashboard showing scheduled work and the recall forecast"
      title="Read the forecast. Then change it."
      detail="A forecast estimates how much you will recall on exam day. Lacuna uses it to choose which reviews earn their place in your next session."
    >
      <Opening title="Memory has a shape.">
        Lacuna looks ahead to exam day and schedules the reviews that lift your expected recall.
      </Opening>
      <figure className="soundings-trace">
        <figcaption>Example recall forecast</figcaption>
        <output>
          {traces[stage].value}
          <small>%</small>
        </output>
        <Trace stage={stage} />
        <div role="group" aria-label="Illustrative review history">
          {traces.map((item, i) => (
            <button key={item.label} aria-pressed={stage === i} onClick={() => setStage(i)}>
              {item.label}
            </button>
          ))}
        </div>
      </figure>
    </Frame>
  );
}
