import { Link, useSearchParams } from 'react-router-dom';
import { ExamFitPrototype } from '../components/landing/ExamFitPrototype';
import {
  MotionOpeningPrototype,
  MotionPrototypeNav,
  MotionClosingPrototype,
} from '../components/landing/MotionOpeningPrototype';
import { CoursePathIllustration } from '../components/landing/CoursePathIllustration';
import { ClosingScenes } from '../components/landing/ClosingScenes';
import { ExamProjection } from '../components/landing/ExamProjection';
import { LandingNav } from '../components/landing/LandingNav';
import { LandingFaq } from '../components/landing/LandingFaq';
import { LacunaIcon } from '../components/ui/icons';
import { IllustratedOpening } from '../components/landing/IllustratedOpening';
import { MemoryScene } from '../components/landing/MemoryScene';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';
import { ProductWalkthrough } from '../components/landing/ProductWalkthrough';
import { LandingCta } from '../components/welcome/LandingCta';
import './Landing.css';

export function Landing() {
  useSmoothScroll(true);
  const [searchParams] = useSearchParams();
  const motionPrototype = searchParams.get('variant') === 'motion';
  return (
    <div className={`landing-preview${motionPrototype ? ' landing-motion-prototype' : ''}`}>
      {motionPrototype ? <MotionPrototypeNav /> : <LandingNav label="Landing navigation" />}
      {import.meta.env.DEV && (
        <Link
          className="motion-prototype-comparison"
          to={motionPrototype ? '?variant=original' : '?variant=motion'}
        >
          {motionPrototype ? 'Prototype / View original' : 'Original / View prototype'}
        </Link>
      )}
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
        {motionPrototype ? <MotionOpeningPrototype /> : <IllustratedOpening />}
        {motionPrototype ? (
          <ExamFitPrototype />
        ) : (
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
                <LandingCta>{motionPrototype ? 'Start revising' : 'Open Lacuna'}</LandingCta>
                {!window.electronAPI?.isElectron && (
                  <Link className="landing-download" to="/download">
                    Download for desktop
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}
        <ProductWalkthrough />
        <ExamProjection />
        <CoursePathIllustration />
        <MemoryScene />
        <section className="landing-bridge">
          <p>
            Familiar isn’t the same
            <br />
            as ready to recall.
          </p>
        </section>
        <ClosingScenes />
        <LandingFaq />
        {motionPrototype && <MotionClosingPrototype />}
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-start">
          <Link to="/welcome" className="landing-brand">
            <LacunaIcon />
            Lacuna
          </Link>
          {!motionPrototype && (
            <LandingCta className="landing-button-small">Get started</LandingCta>
          )}
        </div>
        <div className="landing-footer-end">
          {motionPrototype && (
            <a href="https://github.com/TJ7755/Lacuna" target="_blank" rel="noreferrer">
              GitHub
            </a>
          )}
          <Link to="/method">The method</Link>
        </div>
      </footer>
    </div>
  );
}
