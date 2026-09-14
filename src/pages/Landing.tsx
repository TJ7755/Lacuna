import { Link } from 'react-router-dom';
import { ExamAvailability } from '../components/landing/ExamAvailability';
import { LandingHero, LandingHeader, LandingClosing } from '../components/landing/LandingHero';
import { CoursePathIllustration } from '../components/landing/CoursePathIllustration';
import { ClosingScenes } from '../components/landing/ClosingScenes';
import { LandingFaq } from '../components/landing/LandingFaq';
import { LacunaIcon } from '../components/ui/icons';
import { MemoryScene } from '../components/landing/MemoryScene';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';
import { ProductWalkthrough } from '../components/landing/ProductWalkthrough';
import './Landing.css';

export function Landing() {
  useSmoothScroll(true);
  return (
    <div className="landing-page landing-motion">
      <LandingHeader />
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
        <LandingHero />
        <ExamAvailability />
        <ProductWalkthrough />
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
        <LandingClosing />
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-start">
          <Link to="/welcome" className="landing-brand">
            <LacunaIcon />
            Lacuna
          </Link>
        </div>
        <div className="landing-footer-end">
          <a href="https://github.com/TJ7755/Lacuna" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link to="/method">The method</Link>
        </div>
      </footer>
    </div>
  );
}
