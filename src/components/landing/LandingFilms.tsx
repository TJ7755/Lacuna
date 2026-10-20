import { useEffect, useRef, useState } from 'react';
import { landingFilms as films } from './films';
import './LandingFilms.css';

function FilmPlayer({ film }: { film: keyof typeof films }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const content = films[film];
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (playing) player.current?.focus();
  }, [playing]);
  return (
    <figure className="landing-film">
      <div className="landing-film-screen">
        {playing ? (
          <video
            ref={player}
            tabIndex={0}
            src={content.src}
            poster={content.poster}
            controls
            autoPlay
            playsInline
            preload="none"
            aria-label={content.title}
            aria-describedby={`${film}-film-description`}
            onError={() => setFailed(true)}
          />
        ) : (
          <button
            type="button"
            className="landing-film-play"
            aria-label={`Watch ${content.title}, ${content.duration}`}
            onClick={() => {
              if (window.electronAPI?.isElectron) {
                window.open(content.externalSrc, '_blank', 'noopener,noreferrer');
              } else {
                setPlaying(true);
              }
            }}
          >
            <img src={content.poster} width={1920} height={1080} loading="lazy" alt="" />
            <span className="landing-film-play-label">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Watch the film
            </span>
          </button>
        )}
      </div>
      <figcaption>
        <span>{film === 'gaps' ? 'Demo data' : content.title}</span>
        <span>{content.duration}</span>
      </figcaption>
      <p id={`${film}-film-description`} className="landing-film-description">
        {content.description} Fictional demonstration data. Music, no spoken narration.
      </p>
      {failed && (
        <p className="landing-film-fallback">
          The film couldn’t load.{' '}
          <a href={content.externalSrc} target="_blank" rel="noreferrer">
            Open the video directly
          </a>
          .
        </p>
      )}
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
      <FilmPlayer film="student" />
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
      <FilmPlayer film="gaps" />
    </section>
  );
}
