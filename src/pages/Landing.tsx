import { Link } from 'react-router-dom';
import { CoursePathIllustration } from '../components/landing/CoursePathIllustration';
import { ClosingScenes } from '../components/landing/ClosingScenes';
import { ExamProjection } from '../components/landing/ExamProjection';
import { LandingNav } from '../components/landing/LandingNav';
import { LacunaIcon } from '../components/ui/icons';
import { MemoryScene } from '../components/landing/MemoryScene';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';
import { ProductWalkthrough } from '../components/landing/ProductWalkthrough';
import { LandingCta } from '../components/welcome/LandingCta';
import './Landing.css';

export function Landing() {
  useSmoothScroll(true);
  return (
    <div className="landing-preview">
      <LandingNav label="Landing navigation" />
      <a
        className="landing-skip"
        href="#landing-product"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('landing-product')?.focus({ preventScroll: true });
          document.getElementById('landing-product')?.scrollIntoView();
        }}
      >
        Skip to Lacuna
      </a>
      <main>
        <MemoryScene />
        <section className="landing-bridge">
          <p>
            Familiar isn’t the same
            <br />
            as ready to recall.
          </p>
        </section>
        <section
          id="landing-product"
          className="landing-product"
          tabIndex={-1}
          aria-labelledby="landing-product-title"
        >
          <div className="landing-product-intro">
            <h2 id="landing-product-title">
              Make room
              <br />
              for remembering.
            </h2>
            <p>
              Lacuna brings your lessons, flashcards and revision together around one fixed point:
              your exam.
            </p>
            <div className="landing-actions">
              <LandingCta>Open Lacuna</LandingCta>
              {!window.electronAPI?.isElectron && (
                <Link className="landing-download" to="/download">
                  Download for desktop
                </Link>
              )}
            </div>
          </div>
        </section>
        <ProductWalkthrough />
        <CoursePathIllustration />
        <ExamProjection />
        <ClosingScenes />
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-start">
          <Link to="/welcome" className="landing-brand">
            <LacunaIcon />
            Lacuna
          </Link>
          <LandingCta className="landing-button-small">Get started</LandingCta>
        </div>
        <Link to="/method">The method</Link>
      </footer>
    </div>
  );
}
