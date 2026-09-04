import { Link } from 'react-router-dom';
import { LacunaIcon } from '../components/ui/icons';
import { MemoryScene } from '../components/landing/MemoryScene';
import { useSmoothScroll } from '../components/welcome/useSmoothScroll';
import { ProductWalkthrough } from '../components/landing/ProductWalkthrough';
import './Landing.css';

export function Landing() {
  useSmoothScroll(true);
  return (
    <div className="landing-preview">
      <nav className="landing-nav" aria-label="Landing navigation">
        <Link to="/welcome" className="landing-brand">
          <LacunaIcon />
          Lacuna
        </Link>
        <Link className="landing-button landing-button-small" to="/">
          Open Lacuna
        </Link>
      </nav>
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
              <Link className="landing-button" to="/">
                Open Lacuna
              </Link>
              {!window.electronAPI?.isElectron && (
                <Link className="landing-download" to="/download">
                  Download for desktop
                </Link>
              )}
            </div>
          </div>
        </section>
        <ProductWalkthrough />
        <div className="landing-portability">
          <p>Your study data stays on your device.</p>
          <Link to="/share?intent=import">Import a shared course</Link>
        </div>
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-start">
          <Link to="/welcome" className="landing-brand">
            <LacunaIcon />
            Lacuna
          </Link>
          <Link className="landing-button landing-button-small" to="/">
            Get started
          </Link>
        </div>
        <Link to="/method">The method</Link>
      </footer>
    </div>
  );
}
