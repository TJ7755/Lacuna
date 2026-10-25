import { m as motion } from 'motion/react';
import {
  courseCodes,
  libraryCourses,
  resolveCourseShareUrl,
  type LibraryCourse,
} from '../../library/catalogue';
import { Input } from '../ui/Field';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ChevronRightIcon } from '../ui/icons';
import { scaledSpring } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

const count = new Intl.NumberFormat('en-GB');
const available = libraryCourses.filter((course) => resolveCourseShareUrl(course.shareUrl));
const subjects = [...new Set(available.map((course) => course.subject))].sort((a, b) =>
  a.localeCompare(b, 'en-GB'),
);

export interface LibraryBrowseState {
  query: string;
  subject: string | null;
}

/** Subject first for browsing; searching a board or code reveals its courses directly. */
export function CourseLibraryPicker({
  onChoose,
  autoFocus = false,
  browse,
  onBrowseChange,
}: {
  onChoose: (course: LibraryCourse, shareUrl: string) => void;
  autoFocus?: boolean;
  browse: LibraryBrowseState;
  onBrowseChange: (browse: LibraryBrowseState) => void;
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const spring = scaledSpring(multiplier, 420, 36);
  const terms = browse.query.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
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
        className="import-library-search"
        autoFocus={autoFocus}
        type="search"
        aria-label="Search the course library"
        placeholder="Subject, exam board or code"
        value={browse.query}
        onChange={(event) => onBrowseChange({ ...browse, query: event.target.value })}
      />
      <ul className="import-library-subjects" aria-label="Library subjects">
        {subjects.map((subject) => {
          const courses = shown.filter((course) => course.subject === subject);
          if (courses.length === 0) return null;
          const open = searching || browse.subject === subject;
          return (
            <li key={subject}>
              {searching ? (
                <h3 className="import-library-heading">{subject}</h3>
              ) : (
                <motion.button
                  type="button"
                  className="import-library-subject"
                  aria-expanded={open}
                  onClick={() => onBrowseChange({ ...browse, subject: open ? null : subject })}
                  whileTap={multiplier > 0 ? { scale: 0.99 } : undefined}
                  transition={spring}
                >
                  <strong>{subject}</strong>
                  <span>
                    {courses.length} {courses.length === 1 ? 'course' : 'courses'}
                  </span>
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring}>
                    <ChevronRightIcon width={16} height={16} aria-hidden="true" />
                  </motion.span>
                </motion.button>
              )}
              <AnimatedDisclosure open={open}>
                <ul className="import-library-courses" aria-label={`${subject} courses`}>
                  {courses.map((course) => (
                    <li key={course.id}>
                      <motion.button
                        type="button"
                        className="import-library-course"
                        aria-label={`${course.subject} ${course.qualification} · ${courseCodes(course)}`}
                        onClick={() => onChoose(course, resolveCourseShareUrl(course.shareUrl)!)}
                        whileTap={multiplier > 0 ? { scale: 0.99 } : undefined}
                        transition={spring}
                      >
                        <strong>{course.qualification}</strong>
                        <span>{courseCodes(course)}</span>
                        {course.stats && (
                          <span className="import-library-count">
                            {count.format(course.stats.cards)} cards
                          </span>
                        )}
                      </motion.button>
                    </li>
                  ))}
                </ul>
              </AnimatedDisclosure>
            </li>
          );
        })}
      </ul>
      <p role="status">
        {shown.length === 0 && 'No library course matches. Try a subject or exam board.'}
      </p>
    </div>
  );
}
