import { TeacherSection } from './TeacherSection';
import { NativeFlashcardDemo } from './NativeFlashcardDemo';
import { ExamReadinessHistory } from './ExamReadinessHistory';
import { ExamSteps } from './ExamSteps';
import { ComparisonMatrix } from './ComparisonMatrix';
import { ProductTour } from './ProductTour';
import { ExamLens } from './ExamLens';
import { AccessSection, FaqSection, FitGuide, MigrationSection } from './DecisionSections';
import { Closing, Cta, ProofStrip, SectionHeading } from './ComparisonUi';

function ComparisonSection() {
  return (
    <section id="compare" className="qc-section">
      <SectionHeading title="Lacuna vs Quizlet.">
        Both have flashcards and spaced repetition. Here’s where the experience changes.
      </SectionHeading>
      <ComparisonMatrix />
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
        <ExamReadinessHistory />
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
          Flip a card, fill a gap or recall the next step.
        </SectionHeading>
        <NativeFlashcardDemo />
      </section>
      <ComparisonSection />
      <TeacherSection />
      <AccessSection />
      <MigrationSection />
      <FitSection />
      <FaqSection />
      <Closing />
    </>
  );
}
