import { ExamReadiness, ExamSteps } from './ExamReadiness';
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
import { Arrow, Closing, Cta, Jump, ProofStrip, SectionHeading } from './PrototypeUi';

function ComparisonSection() {
  return (
    <section id="compare" className="qc-section">
      <SectionHeading title="The details make the difference.">
        Both have flashcards and spaced repetition. Here’s where the experience changes.
      </SectionHeading>
      <ComparisonTable />
    </section>
  );
}
function FitSection() {
  return (
    <section id="fit" className="qc-section">
      <SectionHeading title="Choose what fits the way you study." />
      <FitGuide />
    </section>
  );
}
export function ProductStory() {
  return (
    <>
      <section className="qc-story-hero qc-exam-hero">
        <div className="qc-exam-pitch">
          <h1>
            Remember it
            <br /> on <em>exam day.</em>
          </h1>
          <p>
            Lacuna schedules revision around the day you need it. It prioritises the cards a review
            can help most by your exam.
          </p>
          <Cta>Plan my revision</Cta>
          <ExamSteps />
        </div>
        <ExamReadiness />
      </section>
      <ProofStrip />
      <section id="inside" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading title="The context stays with the cards." />
          <p>
            A lesson gives an idea its context. Cards help you retrieve it. Questions let you
            practise using it.
          </p>
        </div>
        <ProductTour />
      </section>
      <section id="schedule" className="qc-section qc-schedule-section">
        <div>
          <SectionHeading title="Your exam isn’t an afterthought." />
          <p>
            Set an assessment date, or choose steady retention. Lacuna adapts card review priorities
            to your study target.
          </p>
          <div className="qc-feature-points">
            <span>Your own assessment date</span>
            <span>Reviews informed by your history</span>
            <span>A session length you choose</span>
          </div>
        </div>
        <ExamLens />
      </section>
      <section id="practice" className="qc-section">
        <SectionHeading title="Don’t just recognise it. Work with it.">
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
  ['verdict', 'Overview'],
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
        <nav aria-label="Comparison chapters">
          {chapters.map(([id, label]) => (
            <Jump key={id} to={id}>
              {label}
            </Jump>
          ))}
        </nav>
        <div className="qc-index-end">
          <Cta>Try Lacuna</Cta>
        </div>
      </aside>
      <div className="qc-guide-body">
        <section className="qc-guide-hero qc-exam-hero">
          <div className="qc-exam-pitch">
            <h1>
              Your exam date changes
              <br /> <em>what you study today.</em>
            </h1>
            <p>
              Choose when you need to remember it. Lacuna prioritises reviews by their predicted
              benefit on exam day.
            </p>
          </div>
          <ExamReadiness />
          <ExamSteps />
        </section>
        <section id="verdict" className="qc-guide-verdict">
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
        </section>
        <ComparisonSection />
        <section id="inside" className="qc-section">
          <SectionHeading title="Inside Lacuna" />
          <ProductTour />
        </section>
        <section id="schedule" className="qc-section">
          <SectionHeading title="A deadline, if you have one.">
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
          <SectionHeading title="Recall is only part of the job." />
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
  title: string;
  text: string;
  screen: ScreenKey;
}[] = [
  {
    label: 'Prepare for an exam',
    title: 'Give your revision a destination.',
    text: 'Connect an assessment date to the course you’re studying. Keep notes, recall and practice in one place.',
    screen: 'course',
  },
  {
    label: 'Keep notes and cards together',
    title: 'Keep the explanation within reach.',
    text: 'Put the idea and its recall cards in the same lesson. Revisit the explanation when a fact needs context.',
    screen: 'lesson',
  },
  {
    label: 'Practise applying ideas',
    title: 'Knowing it is the starting point.',
    text: 'Use focused recall and a separate Questions mode to practise applying what you know.',
    screen: 'recall',
  },
];
export function InteractiveExplorer() {
  const [priority, setPriority] = useState(0);
  const selected = priorities[priority];
  return (
    <>
      <section className="qc-explorer-hero qc-exam-hero">
        <div className="qc-exam-pitch">
          <h1>
            Know it when
            <br /> <em>exam day arrives.</em>
          </h1>
          <p>
            Move the exam date. See how predicted recall changes, and why some cards deserve your
            time before others.
          </p>
          <Cta>Set my exam date</Cta>
          <ExamSteps />
        </div>
        <ExamReadiness />
      </section>
      <section className="qc-priority-stage" aria-label="Choose a study priority">
        <div className="qc-priority-options">
          {priorities.map((item, i) => (
            <button
              key={item.label}
              aria-label={item.label}
              onClick={() => setPriority(i)}
              aria-pressed={priority === i}
            >
              <b>{item.label}</b>
              <Arrow />
            </button>
          ))}
        </div>
        <div className="qc-priority-result" key={priority}>
          <div className="qc-priority-copy">
            <h2>{selected.title}</h2>
            <p>{selected.text}</p>
          </div>
          <ProductScreen screen={selected.screen} compact />
        </div>
      </section>
      <ProofStrip />
      <section id="practice" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading title="Less reading about it. More trying it." />
          <p>
            Five short examples. No account, no saved results. Switch between them and see what
            changes.
          </p>
        </div>
        <LearningLab />
      </section>
      <section id="inside" className="qc-section qc-explorer-tour">
        <SectionHeading title="A place for the things between the cards." />
        <ProductTour />
      </section>
      <section id="schedule" className="qc-section">
        <div className="qc-split-heading">
          <SectionHeading title="A finish line. Or a habit." />
          <p>
            Work towards an exam or keep a subject fresh. Your target gives scheduled practice its
            direction.
          </p>
        </div>
        <ExamLens />
      </section>
      <section id="access" className="qc-section qc-explorer-access">
        <div className="qc-access-intro">
          <SectionHeading title="Open it. Make it yours." />
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
