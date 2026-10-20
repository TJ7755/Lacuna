import { Link } from 'react-router-dom';
import { LandingHero, LandingHeader } from '../components/landing/LandingHero';
import { LandingFaq } from '../components/landing/LandingFaq';
import { LacunaIcon } from '../components/ui/icons';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';
import { LandingFeatures } from '../components/landing/LandingFeatures';
import { LandingCta } from '../components/welcome/LandingCta';
import { LandingStudentFilm, LandingTeacherFilm } from '../components/landing/LandingFilms';
import './Landing.css';

export function Landing() {
  useSmoothScroll(true);
  return (
    <div className="landing-page landing-motion">
      <LandingHeader />
      <a
        className="landing-skip"
        href="#how-it-works"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('how-it-works')?.focus({ preventScroll: true });
          document.getElementById('how-it-works')?.scrollIntoView();
        }}
      >
        Skip to Lacuna
      </a>
      <main>
        <LandingHero />
        <LandingStudentFilm />
        <LandingFeatures />
        <LandingTeacherFilm />
        <LandingFaq />
        <section className="landing-ending" aria-labelledby="landing-ending-title">
          <h2 id="landing-ending-title">Your exam has a date. Start there.</h2>
          <LandingCta>Start revising</LandingCta>
        </section>
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
          {!window.electronAPI?.isElectron && <Link to="/download">Download for desktop</Link>}
          <a
            href={
              window.electronAPI?.isElectron
                ? 'https://getlacuna.app/compare/quizlet/'
                : '/compare/quizlet/'
            }
          >
            Lacuna vs Quizlet
          </a>
        </div>
      </footer>
    </div>
  );
}
