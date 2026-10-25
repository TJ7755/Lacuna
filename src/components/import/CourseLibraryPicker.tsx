import { useState } from 'react';
import {
  courseCodes,
  libraryCourses,
  resolveCourseShareUrl,
  type LibraryCourse,
} from '../../library/catalogue';
import { Input } from '../ui/Field';

const count = new Intl.NumberFormat('en-GB');

/** Library courses that have a published share link, in catalogue order. */
const available = libraryCourses.filter((course) => resolveCourseShareUrl(course.shareUrl));

/**
 * The course library inside the import panel: the same catalogue the library site lists, so
 * a learner can pick a course without leaving Lacuna. Choosing one imports it from its link.
 */
export function CourseLibraryPicker({
  onChoose,
}: {
  onChoose: (course: LibraryCourse, shareUrl: string) => void;
}) {
  const [query, setQuery] = useState('');
  const terms = query.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
  const shown = available.filter((course) => {
    const text = [course.subject, course.board, course.qualification, courseCodes(course)]
      .join(' ')
      .toLocaleLowerCase('en-GB');
    return terms.every((term) => text.includes(term));
  });

  return (
    <div className="import-library">
      <Input
        id="import-library-search"
        type="search"
        aria-label="Search the course library"
        placeholder="Subject, exam board or code"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul aria-label="Library courses">
        {shown.map((course) => (
          <li key={course.id}>
            <button
              type="button"
              onClick={() => onChoose(course, resolveCourseShareUrl(course.shareUrl)!)}
            >
              <strong>{course.subject}</strong>
              <span>
                {course.qualification} · {courseCodes(course)}
              </span>
              {course.stats && <span>{count.format(course.stats.cards)} cards</span>}
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p role="status">No library course matches. Try a subject or exam board.</p>
      )}
    </div>
  );
}
