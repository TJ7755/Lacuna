// Three throwaway comparison-page directions, selected by ?variant=A, B or C.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LacunaIcon } from '../../components/ui/icons';
import './QuizletPrototype.css';
import './PrototypeVariants.css';
import './PrototypeMotion.css';
import { Arrow, Calendar, RecallGraphic, PathGraphic, CourseDemo } from './PrototypeGraphics';

const variants = ['A', 'B', 'C'];
const names = ['The countdown', 'Side by side', 'The bigger picture'];
const sources = {
  spaced:
    'https://help.quizlet.com/hc/en-au/articles/48324742264077-Studying-with-Spaced-Repetition',
  offline:
    'https://help.quizlet.com/hc/en-us/articles/360030565412-Studying-offline-with-Quizlet-mobile-apps',
  learn: 'https://help.quizlet.com/hc/en-au/articles/360030986971-Studying-with-Learn',
};

function Cta() {
  return (
    <Link className="qp-cta" to="/">
      Try Lacuna <Arrow />
    </Link>
  );
}
function Header() {
  return (
    <header className="qp-nav">
      <Link to="/welcome" className="qp-brand">
        <LacunaIcon />
        Lacuna
      </Link>
      <span className="qp-nav-note">A different way to revise.</span>
      <Link to="/">
        Open app <Arrow />
      </Link>
    </header>
  );
}
function Eyebrow() {
  return (
    <div className="qp-eyebrow">
      <span /> LACUNA / QUIZLET
    </div>
  );
}
function Comparison({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={`qp-comparison ${compact ? 'qp-compact' : ''}`}
      aria-label="Feature comparison"
    >
      {!compact && (
        <div className="qp-section-heading">
          <span className="qp-kicker">THE DETAILS</span>
          <h2>A closer look.</h2>
          <p>Shared foundations. Different approaches.</p>
        </div>
      )}
      <div className="qp-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">At a glance</th>
              <th scope="col">Lacuna</th>
              <th scope="col">Quizlet</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Spaced repetition</th>
              <td>
                <b>FSRS-6</b>
                <small>Browser & desktop</small>
              </td>
              <td>
                Recall-based reviews
                <small>
                  Website only <a href={sources.spaced}>[1]</a>
                </small>
              </td>
            </tr>
            <tr>
              <th scope="row">Study direction</th>
              <td>
                <b>Exam dates & daily limits</b>
              </td>
              <td>
                Personalised Learn paths <a href={sources.learn}>[2]</a>
              </td>
            </tr>
            <tr>
              <th scope="row">Offline study</th>
              <td>
                <b>Browser & desktop</b>
                <small>After initial loading</small>
              </td>
              <td>
                iOS & Android apps <a href={sources.offline}>[3]</a>
              </td>
            </tr>
            <tr>
              <th scope="row">Getting started</th>
              <td>
                <b>No account needed</b>
              </td>
              <td>
                Account for Learn <a href={sources.learn}>[2]</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="qp-source-note">
        Quizlet has spaced repetition too. <a href={sources.spaced}>Read its documentation.</a>{' '}
        Sources checked 27 September 2026.
      </p>
    </section>
  );
}

function Closing() {
  return (
    <section className="qp-closing">
      <div>
        <span className="qp-kicker">MAKE ROOM FOR WHAT’S NEXT</span>
        <h2>
          Your next exam.
          <br />
          Your own way.
        </h2>
      </div>
      <div>
        <Cta />
        <p>No account needed. Currently in beta.</p>
      </div>
    </section>
  );
}
function VariantA() {
  return (
    <>
      <section className="qp-hero-a">
        <div className="qp-hero-copy">
          <Eyebrow />
          <h1>
            Your exam
            <br />
            has a date.
            <br />
            <em>Revise for it.</em>
          </h1>
          <p>
            Cards, courses and a daily plan.
            <br />
            Meet the Quizlet alternative built around your exam.
          </p>
          <Cta />
          <div className="qp-mini-proof">
            <span>FSRS-6 scheduling</span>
            <span>No account</span>
          </div>
        </div>
        <div className="qp-calendar-stage">
          <div className="qp-stage-ring" />
          <Calendar />
          <div className="qp-floating-note">
            <span className="qp-dot" /> Today, one step closer.
          </div>
        </div>
      </section>
      <section className="qp-ribbon">
        <span>
          01 <b>Set your exam</b>
        </span>
        <Arrow />
        <span>
          02 <b>Make time</b>
        </span>
        <Arrow />
        <span>
          03 <b>Practise what’s due</b>
        </span>
      </section>
      <Comparison />
      <Closing />
    </>
  );
}
function VariantB() {
  return (
    <>
      <section className="qp-hero-b">
        <Eyebrow />
        <h1>
          Both do flashcards.
          <br />
          <em>Look beyond the flip.</em>
        </h1>
        <p>Lacuna and Quizlet, side by side.</p>
      </section>
      <section className="qp-versus">
        <article>
          <div className="qp-versus-top">
            <span>01 / THE FAMILIAR</span>
            <h2>Start with recall.</h2>
          </div>
          <RecallGraphic />
          <div className="qp-versus-caption">
            <b>Flashcards. Retrieval. Repetition.</b>
            <span>Foundations shared by both.</span>
          </div>
        </article>
        <article>
          <div className="qp-versus-top">
            <span>02 / THE LACUNA APPROACH</span>
            <h2>Build the whole course.</h2>
          </div>
          <PathGraphic />
          <div className="qp-versus-caption">
            <b>Lessons. Cards. Application.</b>
            <span>Organised around your exam.</span>
          </div>
        </article>
      </section>
      <Comparison compact />
      <section className="qp-b-bottom">
        <span>Prefer an exam-focused course?</span>
        <Cta />
      </section>
    </>
  );
}
function VariantC() {
  return (
    <>
      <section className="qp-hero-c">
        <div>
          <Eyebrow />
          <h1>
            See the
            <br />
            <em>bigger picture.</em>
          </h1>
        </div>
        <div>
          <p>
            A Quizlet alternative that connects
            <br />
            what you learn with how you practise.
          </p>
          <Cta />
        </div>
      </section>
      <CourseDemo />
      <div className="qp-c-prompt">
        <span className="qp-dot" /> Explore the four steps. Everything stays in this demo.
      </div>
      <Comparison />
      <Closing />
    </>
  );
}
export default function QuizletPrototype() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('variant') ?? 'A';
  const index = Math.max(0, variants.indexOf(requested));
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      setParams({ variant: variants[next] }, { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, setParams]);
  return (
    <div className={`qp-page qp-variant-${variants[index]} ${paused ? 'qp-paused' : ''}`}>
      <Header />
      <main key={index}>
        {index === 0 ? <VariantA /> : index === 1 ? <VariantB /> : <VariantC />}
      </main>
      <footer className="qp-footer">
        <span>Lacuna / Independent comparison</span>
        <span>Not affiliated with Quizlet.</span>
      </footer>
      {import.meta.env.DEV && (
        <nav className="qp-switcher" aria-label="Prototype variants">
          <button
            aria-label="Previous prototype"
            onClick={() => setParams({ variant: variants[(index + 2) % 3] }, { replace: true })}
          >
            ←
          </button>
          <span>
            <small>DESIGN PROTOTYPE · {index + 1} OF 3</small>
            <b aria-live="polite">
              {variants[index]} — {names[index]}
            </b>
          </span>
          <button
            aria-label="Next prototype"
            onClick={() => setParams({ variant: variants[(index + 1) % 3] }, { replace: true })}
          >
            →
          </button>
          <button className="qp-pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? 'Play motion' : 'Pause motion'}
          </button>
        </nav>
      )}
    </div>
  );
}
