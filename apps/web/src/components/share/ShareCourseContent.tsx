import type { Course } from '@lacuna/core/db/types';
import { useCourseCards } from '../../state/useCourseData';
import { OtherShareWaysFrame, OtherShareControls } from './OtherShareWays';
import { ShareLinkPanel } from './ShareLinkPanel';

/** Keep the alternatives in flow while the selected course's link changes height. */
export function ShareCourseContent({ course, highlight }: { course: Course; highlight: boolean }) {
  return (
    <>
      <ShareLinkPanel course={course} highlight={highlight} />
      <OtherShareWaysFrame>
        <CourseAlternatives key={course.id} course={course} />
      </OtherShareWaysFrame>
    </>
  );
}

function CourseAlternatives({ course }: { course: Course }) {
  // Remount the query with the course so its previous cards cannot be exported.
  const cards = useCourseCards(course.id);
  return <OtherShareControls course={course} cards={cards} />;
}
