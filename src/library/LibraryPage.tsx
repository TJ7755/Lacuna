import { useState } from 'react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { LacunaIcon, MoonIcon, SunIcon } from '../components/ui/icons';
import { useTheme } from '../state/ThemeContext';
import { libraryCourses, resolveCourseShareUrl, type LibraryCourse } from './catalogue';
import './LibraryPage.css';

export function LibraryPage({ courses = libraryCourses }: { courses?: readonly LibraryCourse[] }) {
  const [selectedId, setSelectedId] = useState(courses[0]?.id);
  const { resolvedTheme, setTheme } = useTheme();
  const selected = courses.find((course) => course.id === selectedId) ?? courses[0];
  const shareUrl = selected ? resolveCourseShareUrl(selected.shareUrl) : null;

  return (
    <div className="library-page">
      <a className="skip-link" href="#library-courses">
        Skip to courses
      </a>
      <header className="library-header">
        <a className="library-brand" href="https://getlacuna.app/#/" aria-label="Lacuna home">
          <LacunaIcon width={28} height={28} />
          <span>Lacuna</span>
        </a>
        <nav className="library-navigation" aria-label="Main navigation">
          <button
            type="button"
            className={buttonClassName('ghost', 'sm')}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={`Use ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a className={buttonClassName('secondary')} href="https://getlacuna.app/#/">
            Open Lacuna
          </a>
        </nav>
      </header>

      <main id="library-courses" className="library-main" tabIndex={-1}>
        <div className="library-introduction">
          <h1>Library</h1>
          <p>Choose a course to explore what you can study in Lacuna.</p>
        </div>

        <div className="library-browser">
          <section className="library-subjects" aria-label="Courses">
            {courses.map((course) => (
              <button
                type="button"
                key={course.id}
                className="library-course"
                aria-pressed={selected?.id === course.id}
                aria-controls="library-preview"
                onClick={() => setSelectedId(course.id)}
              >
                <span className="library-course-qualification">{course.qualification}</span>
                <span className="library-course-subject">{course.subject}</span>
                <span className="library-course-code">{course.code}</span>
                <span className="library-course-action">
                  {selected?.id === course.id ? 'Previewing course' : 'Preview course'}
                </span>
              </button>
            ))}
          </section>

          <section
            id="library-preview"
            className="library-preview"
            aria-labelledby="library-preview-heading"
          >
            {selected ? (
              <>
                <div className="library-preview-heading">
                  <p>{selected.qualification}</p>
                  <h2 id="library-preview-heading">{selected.subject}</h2>
                  <p className="library-preview-code">{selected.code}</p>
                </div>
                <p className="library-summary">{selected.summary}</p>
                <div className="library-topics">
                  <h3>What you’ll study</h3>
                  <ul>
                    {selected.topics.map((topic) => (
                      <li key={topic}>{topic}</li>
                    ))}
                  </ul>
                </div>
                <div className="library-open-course">
                  {shareUrl ? (
                    <a className={buttonClassName('primary', 'lg')} href={shareUrl}>
                      Open in Lacuna
                    </a>
                  ) : (
                    <button type="button" className={buttonClassName('secondary', 'lg')} disabled>
                      Available soon
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 id="library-preview-heading">Courses are on their way</h2>
                <p>There are no courses to browse yet.</p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
