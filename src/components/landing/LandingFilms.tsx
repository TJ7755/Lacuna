import { landingFilms as films } from './films';
import './LandingFilms.css';

function FilmStill({ film }: { film: keyof typeof films }) {
  const content = films[film];
  return (
    <figure className="landing-film">
      <div className="landing-film-screen">
        <img
          src={content.poster}
          width={1920}
          height={1080}
          loading="lazy"
          alt={content.description}
        />
      </div>
      <figcaption>
        <span>{content.title}</span>
        <span>Demo data</span>
      </figcaption>
    </figure>
  );
}

export function LandingStudentFilm() {
  return (
    <section className="landing-student-film" aria-labelledby="student-film-title">
      <div className="landing-film-introduction">
        <h2 id="student-film-title">From exam date to everyday revision.</h2>
        <p>Plan your revision, study lesson by lesson, and put what you know into practice.</p>
      </div>
      <FilmStill film="student" />
    </section>
  );
}

export function LandingTeacherFilm() {
  return (
    <section
      id="for-teachers"
      className="landing-teacher-film"
      aria-labelledby="teacher-film-title"
    >
      <div className="landing-teacher-introduction">
        <h2 id="teacher-film-title">Know what to teach next.</h2>
        <div className="landing-teacher-copy">
          <p>See where your class or an individual learner needs help.</p>
          <a className="landing-teacher-cta" href="https://gaps.getlacuna.app">
            Open Gaps
          </a>
        </div>
      </div>
      <FilmStill film="gaps" />
    </section>
  );
}
