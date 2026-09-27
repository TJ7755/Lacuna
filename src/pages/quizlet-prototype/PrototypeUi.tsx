import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LacunaIcon } from '../../components/ui/icons';

export function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg
      className={down ? 'qc-arrow qc-arrow-down' : 'qc-arrow'}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Cta({
  children = 'Try Lacuna',
  secondary = false,
}: {
  children?: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={`qc-button ${secondary ? 'qc-button-secondary' : ''}`} to="/">
      {children}
      <Arrow />
    </Link>
  );
}
export function Jump({
  to,
  children,
  className = '',
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`qc-jump ${className}`}
      onClick={() =>
        document.getElementById(to)?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
          block: 'start',
        })
      }
    >
      {children}
    </button>
  );
}
export function Header() {
  return (
    <header className="qc-nav">
      <Link to="/welcome" className="qc-brand">
        <LacunaIcon />
        Lacuna
      </Link>
      <nav aria-label="Page sections">
        <Jump to="compare">Compare</Jump>
        <Jump to="inside">Inside Lacuna</Jump>
        <Jump to="switch">Switching</Jump>
      </nav>
      <Cta>Open Lacuna</Cta>
    </header>
  );
}
export function Eyebrow({ children = 'LACUNA / QUIZLET' }: { children?: ReactNode }) {
  return (
    <div className="qc-eyebrow">
      <span className="qc-brand-dot" />
      {children}
    </div>
  );
}
export function SectionHeading({
  number,
  eyebrow,
  title,
  children,
}: {
  number?: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="qc-section-heading">
      <span className="qc-kicker">
        {number && <b>{number} / </b>}
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ProofStrip() {
  return (
    <div className="qc-proof-strip">
      <div>
        <strong>£0</strong>
        <span>
          Core revision.
          <br />
          No subscription.
        </span>
      </div>
      <div>
        <strong>FSRS-6</strong>
        <span>
          Scheduled practice.
          <br />
          Exam dates optional.
        </span>
      </div>
      <div>
        <strong>Yours.</strong>
        <span>
          Study data on your device.
          <br />
          No account needed.
        </span>
      </div>
    </div>
  );
}
export function Closing() {
  return (
    <section className="qc-closing">
      <div className="qc-closing-mark" aria-hidden="true">
        <LacunaIcon />
      </div>
      <Eyebrow>YOUR NEXT CHAPTER</Eyebrow>
      <h2>
        Make space
        <br />
        for what sticks.
      </h2>
      <p>Start with one lesson. See how it feels.</p>
      <Cta>Open Lacuna</Cta>
      <small>Free core revision · No account · In beta</small>
    </section>
  );
}
