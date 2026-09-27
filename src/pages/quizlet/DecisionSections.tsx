import { useMemo, useState } from 'react';
import { parseImport } from '../../db/import';
import { Arrow, Cta, SectionHeading } from './ComparisonUi';
import { faqs, sources } from './comparisonContent';

export function Portability() {
  const [text, setText] = useState(
    'Enzyme\tA biological catalyst\nActive site\tWhere the substrate binds\nDenaturation\tA change in a protein’s shape',
  );
  const parsed = useMemo(() => parseImport(text), [text]);
  return (
    <div className="qc-portability">
      <div className="qc-transfer-steps">
        <article>
          <span>01</span>
          <div>
            <h3>Export your own set.</h3>
            <p>
              On the Quizlet website, open a set you created and choose Export. Copy terms and
              definitions with a tab between them.
            </p>
            <a href={sources.export.url} target="_blank" rel="noreferrer">
              Quizlet’s export instructions ↗
            </a>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>Paste. Preview. Check.</h3>
            <p>
              Choose Text or spreadsheet in Lacuna’s Import screen. Review the cards before saving
              them.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>Give it a home.</h3>
            <p>Choose a course and lesson, then start a new review schedule.</p>
            <a href="/#/import">
              Open Lacuna’s importer <Arrow />
            </a>
          </div>
        </article>
      </div>
      <div className="qc-transfer-demo">
        <label htmlFor="qc-import-example">Example terms and definitions</label>
        <textarea
          id="qc-import-example"
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          maxLength={5000}
        />
        <div className="qc-transfer-arrow">
          <Arrow down />
        </div>
        <div className="qc-transfer-preview" aria-live="polite">
          <strong>
            {parsed.cards.length
              ? `${parsed.cards.length} cards ready to preview`
              : 'Add a term and definition to see the preview.'}
          </strong>
          {parsed.cards.slice(0, 4).map((card, i) => (
            <div key={i}>
              <b>{card.front}</b>
              <span>{card.back}</span>
            </div>
          ))}
          {parsed.cards.length > 4 && <small>Showing the first four cards.</small>}
        </div>
        <p className="qc-fineprint">
          Own sets only. Text export does not transfer images or review history. Copied sets cannot
          be exported from Quizlet.
        </p>
      </div>
    </div>
  );
}
export function OfflinePanel() {
  const [offline, setOffline] = useState(false);
  return (
    <div className="qc-offline-panel">
      <div className="qc-offline-header">
        <button
          className="qc-connection"
          aria-pressed={offline}
          onClick={() => setOffline(!offline)}
        >
          <span className={offline ? 'is-offline' : ''} />
          {offline ? 'Offline example' : 'Online example'}
          <span className="qc-toggle">
            <i />
          </span>
        </button>
      </div>
      <div className="qc-device-drawing" aria-hidden="true">
        <div className="qc-laptop">
          <div>
            <span className="qc-brand-dot" />
            <i />
            <i />
            <i />
          </div>
          <span />
        </div>
        <div className={`qc-network-line ${offline ? 'is-offline' : ''}`} />
        <div className="qc-cloud">{offline ? 'Paused' : 'Connected'}</div>
      </div>
      <h3>
        Your material.
        <br />
        On your device.
      </h3>
      <div className="qc-connection-list">
        <div>
          <span>Local cards & notes</span>
          <b>Available</b>
        </div>
        <div>
          <span>Local study</span>
          <b>Available</b>
        </div>
        <div>
          <span>Device sync & sharing</span>
          <b>{offline ? 'Reconnect first' : 'Available online'}</b>
        </div>
        <div>
          <span>Hosted AI & online video</span>
          <b>{offline ? 'Reconnect first' : 'Connection needed'}</b>
        </div>
      </div>
      <p>
        App assets and study material must be loaded before going offline. Keep a full backup of
        important work.
      </p>
    </div>
  );
}
export function CostPanel() {
  return (
    <div className="qc-cost-panel">
      <div className="qc-price">
        <span>£</span>0<small>for core revision</small>
      </div>
      <h3>
        No subscription.
        <br />
        No account to create.
      </h3>
      <ul>
        <li>Make and organise your material</li>
        <li>Study with spaced repetition</li>
        <li>Keep full backups of your data</li>
      </ul>
      <div className="qc-cost-note">
        <b>And Quizlet?</b>
        <p>
          Quizlet offers a free tier and paid plans. Access to Learn, Test and AI tools varies by
          plan.
        </p>
        <a href={sources.plans.url} target="_blank" rel="noreferrer">
          Check current plans ↗
        </a>
      </div>
      <p className="qc-fineprint">
        Lacuna is in beta. Built-in AI is optional and needs separate beta access.
      </p>
    </div>
  );
}
export function FitGuide() {
  return (
    <div className="qc-fit-guide">
      <article>
        <h3>Lacuna</h3>
        <ul>
          <li>You’re working towards an exam date.</li>
          <li>You want lessons, notes and practice together.</li>
          <li>You prefer local study without an account.</li>
          <li>You’re comfortable using a beta product.</li>
        </ul>
        <Cta />
      </article>
      <article>
        <h3>Quizlet</h3>
        <ul>
          <li>Finding existing public sets is your starting point.</li>
          <li>You need live classroom games.</li>
          <li>You rely on expert textbook solutions.</li>
          <li>Your class already shares work there.</li>
        </ul>
        <a href={sources.modes.url} target="_blank" rel="noreferrer">
          Explore Quizlet’s study modes ↗
        </a>
      </article>
    </div>
  );
}
export function Faq() {
  return (
    <div className="qc-faq-list">
      {faqs.map(([question, answer]) => (
        <details key={question}>
          <summary>
            {question}
            <b aria-hidden="true">+</b>
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
export function SourceNotes() {
  return (
    <details className="qc-source-notes">
      <summary>
        Sources & comparison notes <span>27 September 2026 +</span>
      </summary>
      <p>Quizlet features are described from its help centre; plans and availability can change.</p>
      <div>
        {Object.entries(sources).map(([key, source]) => (
          <a key={key} href={source.url} target="_blank" rel="noreferrer">
            Quizlet: {source.label} ↗
          </a>
        ))}
      </div>
    </details>
  );
}
export function AccessSection() {
  return (
    <section id="access" className="qc-section">
      <SectionHeading title="A little less between you and revision.">
        Core study is free. Your work stays on your device.
      </SectionHeading>
      <div className="qc-access-grid">
        <CostPanel />
        <OfflinePanel />
      </div>
    </section>
  );
}
export function MigrationSection() {
  return (
    <section id="switch" className="qc-section">
      <SectionHeading title="Keep the work. Change the workflow.">
        Start with a set you created. Check a few cards before moving more.
      </SectionHeading>
      <Portability />
    </section>
  );
}
export function FaqSection() {
  return (
    <section id="questions" className="qc-section qc-faq-section">
      <SectionHeading title="The useful questions." />
      <Faq />
      <SourceNotes />
    </section>
  );
}
