import { useEffect, useRef, useState } from 'react';
import './CoursePathIllustration.css';

const stops = [
  {
    name: 'Lesson',
    title: 'Start with the idea.',
    text: 'A derivative describes how quickly something changes.',
    icon: 'M9 7 L35 9 L37 42 L10 40 Z M16 17 L29 18 M16 24 L30 25 M17 31 L26 32',
  },
  {
    name: 'Recall',
    title: 'Bring it back to mind.',
    text: 'What does a derivative measure?',
    icon: 'M10 10 L35 6 L40 35 L14 40 Z M17 18 C18 10 31 12 29 20 C28 24 23 23 24 29 M25 34 L25 35',
  },
  {
    name: 'Practice',
    title: 'Put it to work.',
    text: 'If f(x) = eˣ, what is f′(0)?',
    icon: 'M10 7 L33 8 L35 41 L11 40 Z M20 31 L35 15 L40 20 L25 36 L18 39 Z',
  },
  {
    name: 'Exam',
    title: 'A date to work towards.',
    text: 'Your assessment date gives revision its destination.',
    icon: 'M12 43 L13 7 C23 1 30 16 42 8 L41 28 C29 36 24 19 13 26',
  },
];
const trail =
  'M130 70 C245 75 282 138 199 162 C108 188 24 124 30 209 C33 257 157 256 205 272 C312 307 259 370 161 385 C42 404 20 464 91 486 C182 514 297 441 288 532 C281 598 158 584 130 648';

export function CoursePathIllustration() {
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      const examples = Array.from(section.querySelectorAll<HTMLElement>('.journey-example'));
      const centres = examples.map((example) => {
        const rect = example.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const middle = innerHeight / 2;
      let position = 0;
      for (let index = 0; index < centres.length - 1; index++) {
        if (middle >= centres[index])
          position =
            index + Math.min(1, (middle - centres[index]) / (centres[index + 1] - centres[index]));
      }
      setSelected(Math.round(position));
      section.style.setProperty('--journey-progress', String(media.matches ? 1 : position / 3));
      examples.forEach((example, index) => {
        const reveal = media.matches
          ? 1
          : Math.max(0, Math.min(1, (middle - centres[index]) / (innerHeight * 0.22) + 0.65));
        example.style.setProperty('--answer-reveal', String(reveal * reveal * (3 - 2 * reveal)));
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
    };
  }, []);
  return (
    <section ref={ref} className="course-journey" aria-labelledby="journey-title">
      <h2 id="journey-title">A course, one step at a time.</h2>
      <div className="journey-composition">
        <div className="journey-path" role="group" aria-label="Explore the course">
          <svg
            preserveAspectRatio="none"
            className="journey-trail"
            viewBox="0 0 320 720"
            fill="none"
            aria-hidden="true"
          >
            <path d={trail} className="journey-trail-base" />
            <path d={trail} className="journey-trail-progress" pathLength="1" />
            <path
              className="journey-scribbles"
              d="M252 62 L260 48 M262 66 L275 63 M53 335 L44 322 M48 343 L33 342 M242 639 L249 629 M247 647 L260 645 M109 685 Q133 693 157 681"
            />
          </svg>
          {stops.map((stop, index) => (
            <div
              key={stop.name}
              className={`journey-stop journey-stop-${index}`}
              data-active={selected === index}
              aria-current={selected === index ? 'step' : undefined}
            >
              <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <path d={stop.icon} />
              </svg>
              <span>{stop.name}</span>
            </div>
          ))}
        </div>
        <div className="journey-examples">
          {stops.map((stop, index) => (
            <article
              className="journey-example"
              key={stop.name}
              aria-labelledby={`journey-step-${index}`}
            >
              <h3 id={`journey-step-${index}`}>{stop.title}</h3>
              <div className="journey-card" data-flippable={index === 1 || index === 2}>
                <div className="journey-card-turn">
                  <div className="journey-card-face">
                    <p>{stop.text}</p>
                  </div>
                  {(index === 1 || index === 2) && (
                    <div className="journey-card-face journey-answer">
                      <p>
                        {index === 1
                          ? 'The rate at which something changes.'
                          : 'f′(x) = eˣ, so f′(0) = e⁰ = 1.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
