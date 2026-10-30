import { HOSTED_SERVICE_ORIGIN } from '../config/origins';
import { libraryCourses } from './catalogue';

/** Catalogue context follows the published share, never a learner's editable course name. */
export function LibraryCourseCoverage({ shareId }: { shareId?: string | null }) {
  if (!shareId) return null;
  const course = libraryCourses.find(
    (entry) => entry.shareUrl === `${HOSTED_SERVICE_ORIGIN}/#/s/${shareId}`,
  );
  if (!course) return null;
  return (
    <section aria-label="Course coverage" className="mb-4 rounded-2xl bg-ink/[0.06] px-4 py-3">
      <p className="mb-1 font-semibold text-ink">Course coverage</p>
      <p className="text-sm text-ink-soft">{course.summary}</p>
      <a
        href={`${HOSTED_SERVICE_ORIGIN}/courses/${course.id}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-sm text-ink underline underline-offset-4"
      >
        View public course details
      </a>
    </section>
  );
}
