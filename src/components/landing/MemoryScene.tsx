import { useEffect, useRef } from 'react';
import { IllustratedOpening } from './IllustratedOpening';
import { StudyIllustration } from './StudyIllustration';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Scroll position controls the illustration independently of the page’s scrolling behaviour. */
export function MemoryScene() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (media.matches) {
        const opening = section.querySelector<HTMLElement>('.illustrated-opening');
        if (opening) {
          opening.dataset.departed = 'false';
          opening.inert = false;
        }
        return;
      }
      const rect = section.getBoundingClientRect();
      const whole = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      const hero = 1 - clamp((whole - 0.04) / 0.16);
      section.style.setProperty('--hero', String(hero));
      section.style.setProperty('--memory-visible', String(clamp((whole - 0.15) / 0.1)));
      const opening = section.querySelector<HTMLElement>('.illustrated-opening');
      if (opening) {
        opening.dataset.departed = String(hero === 0);
        opening.inert = hero === 0;
      }
      const progress = clamp((whole - 0.24) / 0.76);
      const loss = clamp((progress - 0.14) / 0.24);
      const returnToStudy = clamp((progress - 0.67) / 0.23);
      section.style.setProperty('--loss', String(loss * (1 - returnToStudy)));
      section.style.setProperty('--opening', String(1 - clamp(progress / 0.18)));
      section.style.setProperty(
        '--searching',
        String(clamp((progress - 0.21) / 0.12) * (1 - clamp((progress - 0.59) / 0.1))),
      );
      section.style.setProperty('--returning', String(returnToStudy));
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
    <section className="memory-sequence" ref={ref} aria-label="From familiarity to recall">
      <div className="memory-stage">
        <IllustratedOpening />
        <div className="memory-drawing" aria-hidden="true">
          <StudyIllustration />
        </div>
        <div className="memory-opening">
          <h2>
            You remember
            <br />
            learning it.
          </h2>
        </div>
        <div className="memory-searching" aria-hidden="true">
          <p className="memory-title">
            It’s there.
            <br />
            Somewhere.
          </p>
        </div>
        <div className="memory-returning" aria-hidden="true">
          <p className="memory-title">
            Bring it
            <br />
            back to mind.
          </p>
        </div>
        <div className="memory-word" aria-hidden="true">
          <span className="memory-answer">lacuna</span>
          <span className="memory-blank" />
        </div>
        <div className="memory-caption">
          <p className="memory-searching">You just can’t bring it back.</p>
        </div>
      </div>
      <div className="sr-only">
        <p>
          You recognise the word lacuna: a gap, or a missing part. Later, it feels familiar, but the
          answer escapes you.
        </p>
        <p>Practise bringing an answer to mind, then reveal it and revisit it in later revision.</p>
      </div>
    </section>
  );
}
