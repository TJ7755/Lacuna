import { useEffect, useRef, useState } from 'react';
import { Rating } from 'ts-fsrs';
import { makeEngine } from '../../fsrs/fsrs';
import { defaultFsrsParameters } from '../../fsrs/params';
import './ExamProjection.css';

const engine = makeEngine({ ...defaultFsrsParameters(), enable_fuzz: false });
const EXAM_DAY = 21;
const x = (day: number) => 64 + day / EXAM_DAY * 772;
const y = (recall: number) => 270 - recall * 200;

// A representative card, not an optimiser-generated plan or a learner's forecast.
function project(nextReview: number) {
  let memory = { stability: 2, difficulty: 5 };
  let lastReview = 0;
  const points = [`M ${x(0)} ${y(1)}`];
  for (const end of [nextReview, 10, EXAM_DAY]) {
    for (let day = lastReview + 0.1; day < end; day += 0.1) {
      points.push(`L ${x(day)} ${y(engine.forgetting_curve(day - lastReview, memory.stability))}`);
    }
    points.push(`L ${x(end)} ${y(engine.forgetting_curve(end - lastReview, memory.stability))}`);
    if (end !== EXAM_DAY) {
      memory = engine.next_state(memory, end - lastReview, Rating.Good);
      lastReview = end;
      points.push(`L ${x(end)} ${y(1)}`);
    }
  }
  return {
    path: points.join(' '),
    recall: engine.forgetting_curve(EXAM_DAY - lastReview, memory.stability),
  };
}

const baseline = Array.from({ length: 211 }, (_, i) =>
  `${i === 0 ? 'M' : 'L'} ${x(i / 10)} ${y(engine.forgetting_curve(i / 10, 2))}`,
).join(' ');

export function ExamProjection() {
  const [nextReview, setNextReview] = useState(3);
  const ref = useRef<HTMLElement>(null);
  const projection = project(nextReview);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const progress = media.matches ? 1 : Math.max(0, Math.min(1,
        -rect.top / Math.max(1, rect.height - innerHeight),
      ));
      section.style.setProperty('--curve-progress', String(progress));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
    };
  }, []);

  return (
    <section ref={ref} className="exam-projection" aria-labelledby="exam-projection-title">
      <div className="exam-projection-stage">
        <div className="exam-projection-copy">
          <h2 id="exam-projection-title">Remember it on exam day.</h2>
        </div>
        <figure className="exam-projection-figure">
          <figcaption>Illustrative recall, assuming successful reviews.</figcaption>
          <div className="exam-projection-legend" aria-hidden="true">
            <span>With reviews</span><span>Without</span>
          </div>
          <svg viewBox="0 0 940 330" role="img" aria-label={`Illustrative forgetting curve over 21 days. Reviews on days ${nextReview} and 10 project ${(projection.recall * 100).toFixed(1)}% recall on exam day. The dashed curve shows recall without another review.`}>
            <line className="exam-curve-axis" x1="64" y1="270" x2="836" y2="270" />
            <text x="50" y="76" textAnchor="end">100%</text>
            <text x="50" y="276" textAnchor="end">0%</text>
            <path className="exam-curve-baseline" d={baseline} />
            <path className="exam-curve-preview" d={projection.path} />
            <path className="exam-curve-reviewed" d={projection.path} pathLength="1" />
            {[nextReview, 10].map((day) => (
              <g key={day} className="exam-curve-review">
                <circle cx={x(day)} cy={y(1)} r="5" />
              </g>
            ))}
            <line className="exam-curve-deadline" x1={x(EXAM_DAY)} y1="50" x2={x(EXAM_DAY)} y2="278" />
            <circle className="exam-curve-end" cx={x(EXAM_DAY)} cy={y(projection.recall)} r="7" />
            <text x="64" y="308">Today</text>
            <text className="exam-curve-exam-label" x={x(EXAM_DAY)} y="308" textAnchor="middle">Exam day</text>
          </svg>
          <div className="exam-projection-controls">
            <label htmlFor="exam-next-review">Next review <span>Day {nextReview}</span>
              <input id="exam-next-review" type="range" min="1" max="6" step="1" value={nextReview}
                aria-label="Next review" aria-valuetext={`Day ${nextReview}`}
                onChange={(event) => setNextReview(Number(event.target.value))} />
            </label>
            <div className="exam-projection-result">
              <output htmlFor="exam-next-review">{(projection.recall * 100).toFixed(1)}%</output>
              <span>on exam day</span>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
