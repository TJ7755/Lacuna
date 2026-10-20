import { useParams } from 'react-router-dom';
import { AppLink } from '../components/ui/AppLink';
import { buttonClassName } from '../components/ui/buttonStyles';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { MissingRecord } from '../components/course/MissingRecord';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useCourse } from '../state/useCourseData';
import { createEnrolmentSetting } from '../insights/enrolment';
import { CourseInsightsSection } from './settings/CourseInsightsSection';

export function PupilClassPage() {
  const { courseId } = useParams();
  const course = useCourse(courseId);
  const [enrolment] = createEnrolmentSetting(courseId ?? '').use();

  if (course === undefined) return <PageLoading />;
  if (
    !course ||
    course.archived ||
    !enrolment ||
    enrolment.lineageId !== course.distributedCopy?.lineageId
  ) {
    return (
      <MissingRecord
        message="This class is not connected to an active course on this device."
        to="/?import=1&join=1"
      >
        Join a class
      </MissingRecord>
    );
  }

  return (
    <div className={`${PAGE_FRAME} pb-10`}>
      <header className={PAGE_HEADER}>
        <div className="min-w-0 flex-1">
          <h1 className={PAGE_TITLE}>Gaps</h1>
          <p className="mt-2 break-words text-lg text-ink-soft">{course.name}</p>
        </div>
        <AppLink to={`/course/${course.id}`} className={buttonClassName('secondary', 'sm')}>
          Open course
        </AppLink>
      </header>
      <CourseInsightsSection key={course.id} courseId={course.id} />
    </div>
  );
}
