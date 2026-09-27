import { useState } from 'react';
import { ComparisonTable } from './ComparisonTable';
import { ProductScreen, ProductTour, type ScreenKey } from './ProductTour';
import { ExamLens, LearningLab } from './LearningLab';
import {
  AccessSection,
  CostPanel,
  FaqSection,
  FitGuide,
  MigrationSection,
  OfflinePanel,
} from './DecisionSections';
import { Arrow, Closing, Cta, Eyebrow, Jump, ProofStrip, SectionHeading } from './PrototypeUi';

function ComparisonSection() {
  return (
    <section id="compare" className="qc-section">
      <SectionHeading number="03" eyebrow="THE COMPARISON" title="The details make the difference.">
        Both have flashcards and spaced repetition. Here’s where the experience changes.
      </SectionHeading>
      <ComparisonTable />
    </section>
  );
}
function FitSection() {
  return (
    <section id="fit" className="qc-section">
      <SectionHeading eyebrow="THE HONEST ANSWER" title="Choose what fits the way you study." />
      <FitGuide />
    </section>
  );
}
export function ProductStory() {
  return (
    <>
      <section className="qc-story-hero">
        <Eyebrow>THE QUIZLET ALTERNATIVE FOR YOUR NEXT EXAM</Eyebrow>
        <h1>
          More than a set <br />
          of <em>flashcards.</em>
        </h1>
        <p>Give your revision a home, a rhythm and a date to work towards.</p>
        <div className="qc-hero-actions">
          <Cta>Start revising</Cta>
          <Jump to="inside" className="qc-text-button">
            Take a closer look <Arrow down />
          </Jump>
        </div>
        <div className="qc-hero-product">
          <div className="qc-orbit-stamp">
            <span>YOUR COURSE</span>
            <b>All together.</b>
            <svg viewBox="0 0 80 40" aria-hidden="true">
              <path d="M5 20q15-28 30 0t35 0" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <ProductScreen />
          <div className="qc-floating-chip">
            <span className="qc-brand-dot" /> Notes. Recall. Application.
          </div>
        </div>
      </section>
      <ProofStrip />
      <section id="inside" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading
            number="01"
            eyebrow="A CONNECTED COURSE"
            title="The context stays with the cards."
          />
          <p>
            A lesson gives an idea its context. Cards help you retrieve it. Questions let you
            practise using it.
          </p>
        </div>
        <ProductTour />
      </section>
      <section id="schedule" className="qc-section qc-schedule-section">
        <div>
          <SectionHeading
            number="02"
            eyebrow="A DATE TO WORK TOWARDS"
            title="Your exam isn’t an afterthought."
          />
          <p>
            Set an assessment date, or choose steady retention. Lacuna adapts card review priorities
            to your study target.
          </p>
          <div className="qc-feature-points">
            <span>
              <b>01</b>Your own assessment date
            </span>
            <span>
              <b>02</b>Reviews informed by your history
            </span>
            <span>
              <b>03</b>A session length you choose
            </span>
          </div>
        </div>
        <ExamLens />
      </section>
      <section id="practice" className="qc-section">
        <SectionHeading
          eyebrow="FROM FAMILIAR TO USABLE"
          title="Don’t just recognise it. Work with it."
        >
          Try recalling a fact, filling a gap, naming a part, ordering steps and applying an idea.
        </SectionHeading>
        <LearningLab />
      </section>
      <ComparisonSection />
      <AccessSection />
      <MigrationSection />
      <FitSection />
      <FaqSection />
      <Closing />
    </>
  );
}
const chapters = [
  ['verdict', 'The short version'],
  ['compare', 'The comparison'],
  ['inside', 'Inside the product'],
  ['schedule', 'How reviews work'],
  ['practice', 'Try the practice'],
  ['access', 'Cost & offline use'],
  ['switch', 'Moving your material'],
  ['fit', 'Which should you choose?'],
  ['questions', 'Questions & sources'],
] as const;
export function DecisionGuide() {
  return (
    <div className="qc-guide-layout">
      <aside className="qc-guide-index">
        <span className="qc-kicker">LACUNA VS QUIZLET</span>
        <p>
          A field guide
          <br />
          to your next
          <br />
          <em>study app.</em>
        </p>
        <nav aria-label="Comparison chapters">
          {chapters.map(([id, label], i) => (
            <Jump key={id} to={id}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </Jump>
          ))}
        </nav>
        <div className="qc-index-end">
          <span>Updated 27 Sep 2026</span>
          <Cta>Try Lacuna</Cta>
        </div>
      </aside>
      <div className="qc-guide-body">
        <section className="qc-guide-hero">
          <Eyebrow>A PRACTICAL COMPARISON</Eyebrow>
          <h1>
            A different way <br />
            to <em>get ready.</em>
          </h1>
          <p>Quizlet or Lacuna? Start with what you need from your revision.</p>
          <div className="qc-guide-byline">
            <span>Independent comparison</span>
            <span>12 features · 4 real app views</span>
          </div>
        </section>
        <section id="verdict" className="qc-guide-verdict">
          <span className="qc-kicker">THE SHORT VERSION</span>
          <div>
            <h2>
              For your course,
              <br />
              your exam, your pace.
            </h2>
            <p>
              Lacuna brings structured lessons, scheduled recall and application practice together.
              Quizlet brings a public set library, varied study tools and classroom activities. Both
              offer spaced repetition.
            </p>
          </div>
          <div className="qc-verdict-pills">
            <span>No account to start</span>
            <span>Free core revision</span>
            <span>Local-first study</span>
          </div>
        </section>
        <ComparisonSection />
        <section id="inside" className="qc-section">
          <SectionHeading number="03" eyebrow="PRODUCT EVIDENCE" title="See the actual workspace.">
            A fresh capture of Lacuna’s built-in course. Open any screen at full size.
          </SectionHeading>
          <ProductTour />
        </section>
        <section id="schedule" className="qc-section">
          <SectionHeading
            number="04"
            eyebrow="THE REVIEW ROUTINE"
            title="A deadline, if you have one."
          >
            Lacuna uses FSRS-6 for card scheduling. Exam mode gives those reviews a specific target;
            steady retention keeps the routine open-ended.
          </SectionHeading>
          <ExamLens />
          <div className="qc-editorial-note">
            <b>What the comparison doesn’t claim</b>
            <p>
              Quizlet also schedules repeat reviews. Neither a scheduler nor a progress indicator is
              a guarantee of an exam result.
            </p>
          </div>
        </section>
        <section id="practice" className="qc-section">
          <SectionHeading
            number="05"
            eyebrow="TRY IT YOURSELF"
            title="Recall is only part of the job."
          />
          <LearningLab />
        </section>
        <AccessSection />
        <MigrationSection />
        <FitSection />
        <FaqSection />
        <Closing />
      </div>
    </div>
  );
}
const priorities: {
  label: string;
  short: string;
  title: string;
  text: string;
  screen: ScreenKey;
  tags: string[];
}[] = [
  {
    label: 'Prepare for an exam',
    short: 'An exam to aim for',
    title: 'Give your revision a destination.',
    text: 'Connect an assessment date to the course you’re studying. Keep notes, recall and practice in one place.',
    screen: 'course',
    tags: ['Assessment dates', 'Course structure', 'Scheduled recall'],
  },
  {
    label: 'Keep notes and cards together',
    short: 'Everything in context',
    title: 'Keep the explanation within reach.',
    text: 'Put the idea and its recall cards in the same lesson. Revisit the explanation when a fact needs context.',
    screen: 'lesson',
    tags: ['Lesson notes', 'Maths & Markdown', 'Related cards'],
  },
  {
    label: 'Practise applying ideas',
    short: 'More than recognition',
    title: 'Knowing it is the starting point.',
    text: 'Use focused recall and a separate Questions mode to practise applying what you know.',
    screen: 'recall',
    tags: ['Active recall', 'Application questions', 'Worked explanations'],
  },
];
export function InteractiveExplorer() {
  const [priority, setPriority] = useState(0);
  const selected = priorities[priority];
  return (
    <>
      <section className="qc-explorer-hero">
        <div>
          <Eyebrow>LACUNA VS QUIZLET / EXPLORE THE DIFFERENCE</Eyebrow>
          <h1>
            Find your way <br />
            to <em>ready.</em>
          </h1>
        </div>
        <div className="qc-explorer-intro">
          <p>A course, an exam, a little more confidence in what you know.</p>
          <Cta>Try Lacuna</Cta>
        </div>
      </section>
      <section className="qc-priority-stage" aria-label="Choose a study priority">
        <div className="qc-priority-options">
          <span className="qc-kicker">WHAT WOULD YOU CHANGE?</span>
          {priorities.map((item, i) => (
            <button
              key={item.label}
              aria-label={item.label}
              onClick={() => setPriority(i)}
              aria-pressed={priority === i}
            >
              <span>0{i + 1}</span>
              <b>{item.label}</b>
              <Arrow />
            </button>
          ))}
          <div className="qc-priority-foot">
            Choose a priority.
            <br />
            Take a look inside.
          </div>
        </div>
        <div className="qc-priority-result" key={priority}>
          <div className="qc-priority-copy">
            <span className="qc-kicker">{selected.short}</span>
            <h2>{selected.title}</h2>
            <p>{selected.text}</p>
            <div>
              {selected.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <ProductScreen screen={selected.screen} compact />
        </div>
      </section>
      <ProofStrip />
      <section id="practice" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading
            number="01"
            eyebrow="GET A FEEL FOR IT"
            title="Less reading about it. More trying it."
          />
          <p>
            Five short examples. No account, no saved results. Switch between them and see what
            changes.
          </p>
        </div>
        <LearningLab />
      </section>
      <section id="inside" className="qc-section qc-explorer-tour">
        <SectionHeading
          number="02"
          eyebrow="THE BIGGER PICTURE"
          title="A place for the things between the cards."
        >
          The explanation. The lesson. The assessment ahead. Explore the actual app.
        </SectionHeading>
        <ProductTour />
      </section>
      <section id="schedule" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading eyebrow="CHOOSE YOUR DIRECTION" title="A finish line. Or a habit." />
          <p>
            Work towards an exam or keep a subject fresh. Your target gives scheduled practice its
            direction.
          </p>
        </div>
        <ExamLens />
      </section>
      <section id="access" className="qc-section qc-explorer-access">
        <div className="qc-access-intro">
          <SectionHeading number="03" eyebrow="FEWER BARRIERS" title="Open it. Make it yours." />
          <p>
            No account for local study. No subscription for core revision. Optional online features
            stay separate.
          </p>
          <Cta />
        </div>
        <div className="qc-access-grid">
          <OfflinePanel />
          <CostPanel />
        </div>
      </section>
      <ComparisonSection />
      <MigrationSection />
      <FitSection />
      <FaqSection />
      <Closing />
    </>
  );
}
