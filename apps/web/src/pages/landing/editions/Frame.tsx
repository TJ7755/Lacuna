import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LandingFaq } from '../../../components/landing/LandingFaq';
import { LandingCta } from '../../../components/welcome/LandingCta';
import { LacunaIcon } from '../../../components/ui/icons';
import { LIBRARY_ORIGIN } from '../../../config/origins';
import './frame.css';

export function Opening({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="edition-intro">
      <h1>{title}</h1>
      <p>{children}</p>
      <LandingCta>Start revising</LandingCta>
    </div>
  );
}

export function Frame({
  edition,
  children,
  image,
  alt,
  title,
  detail,
}: {
  edition: string;
  children: ReactNode;
  image: string;
  alt: string;
  title: string;
  detail: string;
}) {
  const desktop = window.electronAPI?.isElectron;
  return (
    <div className={`landing-page edition edition-${edition}`}>
      <a
        className="edition-skip"
        href="#edition-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('edition-main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header>
        <nav aria-label="Main navigation">
          <span className="edition-brand">
            <LacunaIcon />
            Lacuna
          </span>
          <a href={LIBRARY_ORIGIN}>Course library</a>
          {!desktop && <Link to="/download">Desktop app</Link>}
        </nav>
      </header>
      <main tabIndex={-1} id="edition-main">
        <section className="edition-opening">{children}</section>
        <section className="edition-proof">
          <div>
            <h2>{title}</h2>
            <p>{detail}</p>
            <Link to="/method">Explore the method</Link>
          </div>
          <img loading="lazy" src={`/landing/${image}.png`} alt={alt} />
        </section>
        <section className="edition-ownership">
          <h2>Your revision stays with you.</h2>
          <p>
            Study on your device without an account. Bring an Anki deck, save a backup to a file, or
            choose encrypted sync to carry on elsewhere.
          </p>
        </section>
        <LandingFaq />
      </main>
      <footer>
        <span className="edition-brand">
          <LacunaIcon />
          Lacuna
        </span>
        <a href={desktop ? 'https://getlacuna.app/courses/' : '/courses/'}>Courses</a>
        <a href="https://gaps.getlacuna.app">Gaps for teachers</a>
        <a href={desktop ? 'https://getlacuna.app/compare/quizlet/' : '/compare/quizlet/'}>
          Compare Quizlet
        </a>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href="https://github.com/TJ7755/Lacuna">GitHub</a>
      </footer>
    </div>
  );
}
