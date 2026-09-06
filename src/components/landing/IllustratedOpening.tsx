import { LandingCta } from '../welcome/LandingCta';
import { StudyIllustration } from './StudyIllustration';
import './IllustratedOpening.css';

export function IllustratedOpening() {
  return (
    <section
      className="illustrated-opening"
      aria-label="Revision around your exam"
      data-emphasis="exam"
    >
      <h1 className="opening-title">Put your revision time where it matters.</h1>
      <div className="landing-actions">
        <LandingCta>Start revising</LandingCta>
      </div>
      <div className="opening-composition">
        <StudyIllustration />
        <div className="opening-dashboard">
          <img
            src={`${import.meta.env.BASE_URL}landing/study-plan.png`}
            width="1280"
            height="800"
            alt="Lacuna dashboard showing the welcome course and daily revision"
            fetchPriority="high"
          />
        </div>
      </div>
    </section>
  );
}
