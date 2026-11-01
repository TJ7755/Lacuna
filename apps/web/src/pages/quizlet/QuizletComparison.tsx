import { useState } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { ProductStory } from './ProductStory';
import { Header } from './ComparisonUi';
import './QuizletComparison.css';
import './ComparisonSections.css';
import './InteractiveSections.css';
import './TransferSections.css';
import './ComparisonMotion.css';
import './ComparisonResponsive.css';
import './ExamReadiness.css';

export function QuizletComparison() {
  const [paused, setPaused] = useState(false);
  return (
    <LazyMotion features={domAnimation}>
      <div className={`qc-page qc-variant-A qc-public ${paused ? 'qc-paused' : ''}`}>
        <Header />
        <main>
          <ProductStory />
        </main>
        <footer className="qc-footer">
          <a href="/">Lacuna</a>
          <span>Not affiliated with Quizlet.</span>
          <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? 'Play animation' : 'Pause animation'}
          </button>
        </footer>
      </div>
    </LazyMotion>
  );
}
