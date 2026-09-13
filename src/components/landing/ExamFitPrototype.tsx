import { useEffect, useRef, type CSSProperties } from 'react';
import './ExamFitPrototype.css';

// A visual explanation of priorities, not a generated study schedule.
const cards = [
  { x: -210, y: -85, angle: -18, mark: 'M24 32h32M24 46h20' },
  { x: -10, y: 90, angle: 14, mark: 'm24 41 11 11 23-25' },
  { x: 125, y: -100, angle: 22, mark: 'M29 27v30m22-30v30M22 37h36m-36 12h36' },
];

export function ExamFitPrototype() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const progress = media.matches
        ? 1
        : Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - innerHeight)));
      section.style.setProperty('--fit', String(progress));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
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
    <section
      id="landing-product"
      className="exam-fit-prototype"
      aria-labelledby="landing-product-title"
      tabIndex={-1}
      ref={ref}
    >
      <div className="exam-fit-stage">
        <div className="exam-fit-copy">
          <h2 id="landing-product-title">
            Your time sets the pace.
            <br /> <span>Exam day sets the goal.</span>
          </h2>
          <p>
            Choose how long to study and when your exam is. Lacuna prioritises the reviews predicted
            to help you remember on that day.
          </p>
        </div>
        <svg
          className="exam-fit-drawing"
          viewBox="0 0 960 380"
          role="img"
          aria-label="Review cards come together into a session, pointing towards a fixed exam day."
        >
          <rect className="exam-fit-session" x="220" y="84" width="384" height="204" rx="30" />
          <g
            className="exam-fit-time"
            transform="translate(388 56)"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <circle r="15" />
            <path d="M0-8v9l6 4" />
          </g>
          <text className="exam-fit-label" x="414" y="61">
            Your time
          </text>
          {cards.map((card, index) => (
            <g key={card.mark} transform={`translate(${260 + index * 106} 132)`}>
              <g
                className={`exam-fit-card exam-fit-card-${index}`}
                style={
                  {
                    '--dx': `${card.x}px`,
                    '--dy': `${card.y}px`,
                    '--angle': `${card.angle}deg`,
                  } as CSSProperties
                }
              >
                <rect width="82" height="106" rx="12" />
                <path
                  d={card.mark}
                  fill="none"
                  stroke="#131210"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="41" cy="83" r="4" fill="#131210" />
              </g>
            </g>
          ))}
          <path
            className="exam-fit-arrow"
            d="M635 185h70m-10-10 10 10-10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g className="exam-fit-date" transform="translate(746 105)">
            <rect width="140" height="158" rx="20" fill="var(--amber)" />
            <path
              d="M0 43h140M37-8v25M103-8v25"
              stroke="#131210"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="m49 86 16 16 28-34"
              fill="none"
              stroke="#131210"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x="70" y="135" textAnchor="middle" fill="#131210">
              Exam day
            </text>
          </g>
          <text className="exam-fit-caption" x="412" y="332" textAnchor="middle">
            A session that fits.
          </text>
          <text className="exam-fit-caption" x="816" y="332" textAnchor="middle">
            A date to aim for.
          </text>
        </svg>
      </div>
    </section>
  );
}
