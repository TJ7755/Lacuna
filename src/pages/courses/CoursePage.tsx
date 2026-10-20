import { libraryCourses, type LibraryCourse } from '../../library/catalogue';
import { Header, SectionHeading } from '../quizlet/ComparisonUi';
import '../quizlet/QuizletComparison.css';
import '../quizlet/ComparisonResponsive.css';
import './CoursePage.css';

export function CoursePage({ course }: { course?: LibraryCourse }) {
  const stats = course?.stats;
  return (
    <div className="qc-page course-page">
      <Header sectionBase="/compare/quizlet/" />
      <main className="qc-section course-content">
        {course ? (
          <>
            <div className="course-intro">
              <h1>
                {course.subject} {course.code}
              </h1>
              <p>{course.qualification}</p>
              <p>{course.summary}</p>
              {stats && (
                <ul className="course-stats">
                  {(
                    [
                      ['cards', 'flashcards'],
                      ['notes', 'notes'],
                      ['practiceSets', 'practice sets'],
                      ['practiceMarks', 'marks of practice'],
                    ] as const
                  ).map(([key, label]) => (
                    <li key={key}>
                      {stats[key].toLocaleString('en-GB')} {label}
                    </li>
                  ))}
                </ul>
              )}
              {course.shareUrl ? (
                <a className="qc-button" href={course.shareUrl}>
                  Start revising
                </a>
              ) : (
                <p>Coming soon</p>
              )}
            </div>
            <section>
              <SectionHeading title="What it covers" />
              <ol>
                {course.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ol>
            </section>
            <section className="course-how">
              <SectionHeading title="How it works" />
              <p>
                Add the course in one click. No account is needed and your progress stays on your
                device.
              </p>
              <p>Set your exam date. Lacuna plans daily reviews so everything is secure in time.</p>
              <p>
                Practise exam-style questions that are marked for you, separately from your
                flashcards.
              </p>
            </section>
            <a href="/courses/">All courses</a>
          </>
        ) : (
          <>
            <h1>Revision courses</h1>
            {libraryCourses.map((entry) => (
              <section className="course-index-entry" key={entry.id}>
                <h2>
                  <a href={`/courses/${entry.id}/`}>
                    {entry.subject} {entry.code}
                  </a>
                </h2>
                <p>{entry.qualification}</p>
                <p>{entry.summary}</p>
              </section>
            ))}
          </>
        )}
      </main>
      <footer className="qc-footer">
        <a href="/">Lacuna</a>
      </footer>
    </div>
  );
}
