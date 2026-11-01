import { useId, useState } from 'react';
import type { LibraryCourse } from './catalogue';
import './CourseProvenance.css';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function reportUrl(id: string, revision: number | undefined, itemReference: string) {
  const body = [`Course: ${id}`];
  if (revision !== undefined) body.push(`Revision: ${revision}`);
  if (itemReference.trim()) body.push(`Item reference: ${itemReference.trim()}`);
  const query = new URLSearchParams({ title: `Course mistake: ${id}`, body: body.join('\n') });
  return `https://github.com/TJ7755/Lacuna/issues/new?${query}`;
}

export function CourseProvenance({ course }: { course: LibraryCourse }) {
  const [itemReference, setItemReference] = useState('');
  const inputId = useId();
  return (
    <section aria-label="Course provenance" className="course-provenance">
      <dl>
        {course.author && (
          <div>
            <dt>Author</dt>
            <dd>{course.author}</dd>
          </div>
        )}
        {course.publisher && (
          <div>
            <dt>Publisher</dt>
            <dd>{course.publisher}</dd>
          </div>
        )}
        {course.revision !== undefined && (
          <div>
            <dt>Revision</dt>
            <dd>{course.revision}</dd>
          </div>
        )}
        {course.revisionDate && (
          <div>
            <dt>Revision date</dt>
            <dd>
              <time dateTime={course.revisionDate}>
                {dateFormat.format(new Date(`${course.revisionDate}T00:00:00Z`))}
              </time>
            </dd>
          </div>
        )}
      </dl>
      <label htmlFor={inputId}>Item reference (optional)</label>
      <input
        id={inputId}
        type="text"
        maxLength={200}
        value={itemReference}
        onChange={(event) => setItemReference(event.target.value)}
        autoComplete="off"
        aria-describedby={`${inputId}-help`}
      />
      <p id={`${inputId}-help`}>
        Enter a card, note or practice set reference. Only the course id, known revision and the
        reference you enter are included in the GitHub report.
      </p>
      <a
        href={reportUrl(course.id, course.revision, itemReference)}
        target="_blank"
        rel="noreferrer"
      >
        Report a mistake
      </a>
    </section>
  );
}
