import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { LacunaIcon } from '../ui/icons';
import { LandingCta } from '../welcome/LandingCta';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import './MotionOpeningPrototype.css';

// Branch-only exploration: compare ?variant=motion with the existing landing route.
function RevisionObjects() {
  return (
    <span className="revision-reel" aria-hidden="true">
      <span className="revision-object revision-object-cards">
        <svg viewBox="0 0 120 120" fill="none">
          <rect
            x="27"
            y="17"
            width="72"
            height="87"
            rx="10"
            fill="#a77331"
            transform="rotate(13 63 60)"
          />
          <rect
            x="19"
            y="20"
            width="72"
            height="87"
            rx="10"
            fill="#dbc8ab"
            transform="rotate(-12 55 63)"
          />
          <g transform="rotate(-5 60 60)">
            <rect x="22" y="14" width="76" height="91" rx="10" fill="#faf1df" />
            <path d="M35 32h23M35 39h13" stroke="#b7a283" strokeWidth="3" strokeLinecap="round" />
            <path
              d="m44 68 11 11 23-27"
              stroke="#bd741d"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M37 92h44" stroke="#ded1bb" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      </span>
      <span className="revision-object revision-object-book">
        <svg viewBox="0 0 120 120" fill="none">
          <g transform="rotate(8 60 60)">
            <path d="M23 19h71a8 8 0 0 1 8 8v72a8 8 0 0 1-8 8H23z" fill="#714a24" />
            <path d="M27 25h66v77H27z" fill="#f1dfbe" />
            <path d="M30 90h60m-60 5h60" stroke="#c4ac87" strokeWidth="1.5" />
            <rect x="18" y="13" width="79" height="80" rx="6" fill="#e8a447" />
            <path d="M29 13v80" stroke="#bd7d32" strokeWidth="2" />
            <rect x="43" y="29" width="38" height="27" rx="3" fill="#f9e7c6" />
            <path d="M51 38h22m-22 8h15" stroke="#b57a35" strokeWidth="2" strokeLinecap="round" />
            <path d="M74 72v33l-7-5-7 5V72" fill="#af6135" />
          </g>
        </svg>
      </span>
      <span className="revision-object revision-object-calendar">
        <svg viewBox="0 0 120 120" fill="none">
          <g transform="rotate(-7 60 60)">
            <path d="m28 29-9 79h88L95 29z" fill="#805829" />
            <rect x="19" y="20" width="82" height="82" rx="9" fill="#f6ebd7" />
            <path d="M28 20h64a9 9 0 0 1 9 9v17H19V29a9 9 0 0 1 9-9Z" fill="#efa63e" />
            <path d="M38 14v15m44-15v15" stroke="#f7dfb4" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M32 59h7m14 0h7m14 0h7M32 73h7m35 0h7M32 87h7m14 0h7m14 0h7"
              stroke="#c5b499"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="56" cy="73" r="12" stroke="#ba7321" strokeWidth="2.5" />
            <path
              d="m51 73 4 4 7-8"
              stroke="#ba7321"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </span>
    </span>
  );
}

export function MotionOpeningPrototype() {
  const [paused, setPaused] = useState(false);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <section
      className="motion-opening-prototype"
      aria-label="Revision around your exam"
      data-paused={paused || multiplier === 0}
      style={{ '--reel-duration': `${10.8 * (multiplier || 1)}s` } as CSSProperties}
    >
      <div className="motion-opening-content">
        <div className="motion-opening-mark" aria-hidden="true">
          <LacunaIcon />
        </div>
        <h1>
          <span className="motion-opening-line">
            Your revision
            <RevisionObjects />,
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

export function MotionPrototypeNav() {
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
    <nav
      className="landing-nav motion-prototype-nav"
      data-docked={docked}
      aria-label="Landing navigation"
    >
      <Link to="/welcome?variant=motion" className="landing-brand">
        <LacunaIcon />
        Lacuna
      </Link>
      <span className="motion-nav-mark" aria-hidden="true">
        <LacunaIcon />
      </span>
      <Link className="motion-prototype-download" to="/download">
        Download for desktop <span aria-hidden="true">↗</span>
      </Link>
    </nav>
  );
}

export function MotionClosingPrototype() {
  return (
    <section className="motion-closing-prototype" aria-labelledby="motion-closing-title">
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
