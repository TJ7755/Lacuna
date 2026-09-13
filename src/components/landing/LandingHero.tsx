import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { LacunaIcon } from '../ui/icons';
import { LandingCta } from '../welcome/LandingCta';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { RevisionIllustrations } from './RevisionIllustrations';
import './LandingHero.css';

export function LandingHero() {
  const [paused, setPaused] = useState(false);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <section
      className="motion-opening"
      aria-label="Revision around your exam"
      data-paused={paused || multiplier === 0}
      style={{ '--reel-duration': `${24 * (multiplier || 1)}s` } as CSSProperties}
    >
      <div className="motion-opening-content">
        <div className="motion-opening-mark" aria-hidden="true">
          <LacunaIcon />
        </div>
        <h1 aria-label="Your revision, built around your exam.">
          <span className="motion-opening-line">
            Your revision
            <RevisionIllustrations />,
          </span>{' '}
          <span className="motion-opening-line">
            built around <span className="motion-opening-emphasis">your exam.</span>
          </span>
        </h1>
        <LandingCta>Start revising</LandingCta>
      </div>
      <a
        className="motion-opening-discover"
        href="#landing-product"
        onClick={(event) => {
          event.preventDefault();
          const product = document.getElementById('landing-product');
          product?.focus({ preventScroll: true });
          product?.scrollIntoView({ behavior: multiplier === 0 ? 'instant' : 'smooth' });
        }}
      >
        See how it works <span aria-hidden="true">↓</span>
      </a>
      <button
        className="motion-opening-pause"
        aria-label={paused ? 'Play illustrations' : 'Pause illustrations'}
        onClick={() => setPaused(!paused)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
          {paused ? <path d="m5 3 8 5-8 5z" /> : <path d="M4 3h2v10H4zm6 0h2v10h-2z" />}
        </svg>
      </button>
    </section>
  );
}

export function LandingHeader() {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const heroMark = document.querySelector('.motion-opening-mark');
    if (!heroMark) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDocked(entry.boundingClientRect.bottom <= 96),
      { rootMargin: '-96px 0px 0px 0px' },
    );
    observer.observe(heroMark);
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="landing-nav motion-header" data-docked={docked} aria-label="Landing navigation">
      <Link to="/welcome" className="landing-brand" aria-hidden={docked} tabIndex={docked ? -1 : 0}>
        <LacunaIcon />
        Lacuna
      </Link>
      <Link
        to="/welcome"
        className="motion-nav-mark"
        aria-label="Lacuna"
        aria-hidden={!docked}
        tabIndex={docked ? 0 : -1}
      >
        <LacunaIcon />
      </Link>
      {!window.electronAPI?.isElectron && (
        <Link className="motion-header-download" to="/download">
          Download for desktop <span aria-hidden="true">↗</span>
        </Link>
      )}
    </nav>
  );
}

export function LandingClosing() {
  return (
    <section className="motion-closing" aria-labelledby="motion-closing-title">
      <h2 id="motion-closing-title">Ready to make it stick?</h2>
      <div className="motion-closing-actions">
        <LandingCta>Start revising</LandingCta>
        {!window.electronAPI?.isElectron && (
          <Link className="motion-closing-download" to="/download">
            Download for desktop <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
    </section>
  );
}
