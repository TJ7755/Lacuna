// Three complete, throwaway comparison journeys. Select with ?variant=A, B or C.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DecisionGuide, InteractiveExplorer, ProductStory } from './ComparisonVariants';
import { Header } from './PrototypeUi';
import './QuizletPrototype.css';
import './ComparisonSections.css';
import './InteractiveSections.css';
import './TransferSections.css';
import './ComparisonLayouts.css';
import './PrototypeMotion.css';
import './PrototypeResponsive.css';
import './PrototypeLayoutResponsive.css';

const variants = ['A', 'B', 'C'];
const names = ['The product story', 'The decision guide', 'The interactive explorer'];
export default function QuizletPrototype() {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, variants.indexOf(params.get('variant') ?? 'A'));
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable], dialog[open], [role="radiogroup"]',
        )
      )
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      setParams({ variant: variants[next] }, { replace: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, setParams]);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('qc-in-view');
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    root.current.querySelectorAll('.qc-section').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [index]);
  function change(next: number) {
    setParams({ variant: variants[next] }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return (
    <div
      ref={root}
      className={`qc-page qc-variant-${variants[index]} ${paused ? 'qc-paused' : ''}`}
    >
      <Header />
      <main key={index}>
        {index === 0 ? <ProductStory /> : index === 1 ? <DecisionGuide /> : <InteractiveExplorer />}
      </main>
      <footer className="qc-footer">
        <span>Lacuna</span>
        <span>Not affiliated with Quizlet.</span>
      </footer>
      {import.meta.env.DEV && (
        <nav className="qc-switcher" aria-label="Prototype variants">
          <button aria-label="Previous prototype" onClick={() => change((index + 2) % 3)}>
            ←
          </button>
          <span>
            <small>ROUND 2 · {index + 1} / 3</small>
            <b aria-live="polite">
              {variants[index]} — {names[index]}
            </b>
          </span>
          <button aria-label="Next prototype" onClick={() => change((index + 1) % 3)}>
            →
          </button>
          <button className="qc-pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? 'Play motion' : 'Pause motion'}
          </button>
        </nav>
      )}
    </div>
  );
}
