import { useEffect, useRef } from 'react';
import { ExamPriorityExample } from './ExamPriorityExample';
import { RevisionGlyph } from './RevisionIllustrations';
import './ExamFitPrototype.css';

export function ExamFitPrototype() {
  const ref = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const examRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const paint = () => {
      frame = 0;
      const staticLayout = media.matches || innerWidth <= 1000;
      const rect = section.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height - innerHeight));
      section.style.setProperty('--fit', String(progress));
      // Leave a short empty beat between ideas; never crossfade competing headlines.
      section.style.setProperty('--time-opacity', String(1 - clamp((progress - 0.36) / 0.1)));
      section.style.setProperty('--exam-opacity', String(clamp((progress - 0.56) / 0.1)));
      if (examRef.current) examRef.current.inert = !staticLayout && progress <= 0.56;
      timeRef.current?.setAttribute('aria-hidden', String(!staticLayout && progress >= 0.46));
      examRef.current?.setAttribute('aria-hidden', String(!staticLayout && progress <= 0.56));
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
      aria-label="Revision for your time and exam day"
      tabIndex={-1}
      ref={ref}
    >
      <div className="exam-fit-stage">
        <div className="exam-fit-beat exam-fit-time-beat" ref={timeRef}>
          <h2 id="landing-product-title">
            Your time.
            <br /> Your pace.
          </h2>
          <p>Set a session time limit.</p>
          <RevisionGlyph kind="clock" />
        </div>
        <div className="exam-fit-beat exam-fit-exam-beat" ref={examRef} aria-hidden="true">
          <h2>Your exam. Your availability.</h2>
          <ExamPriorityExample />
        </div>
      </div>
    </section>
  );
}
