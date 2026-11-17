import { useLayoutEffect, useRef } from 'react';
import { useIsPresent } from 'motion/react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLink } from '../components/ui/AppLink';
import { buttonClassName } from '../components/ui/buttonStyles';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { focusCourseHeading } from '../components/course/focusCourseHeading';
import { MissingRecord } from '../components/course/MissingRecord';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useToast } from '../components/ui/Toast';
import { useCourse } from '../state/useCourseData';
import { createEnrolmentSetting } from '../insights/enrolment';
import { CourseInsightsSection } from './settings/CourseInsightsSection';

export function PupilClassPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const present = useIsPresent();
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = present;
    return () => {
      active.current = false;
    };
  }, [present]);
  const course = useCourse(courseId);
  // The hook keys its subscription by course, so in-app navigation re-reads
  // the new course's stored enrolment instead of showing stale state.
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
      <header className={`${PAGE_HEADER} max-w-3xl`}>
        <div className="min-w-0 flex-1">
          <h1 className={PAGE_TITLE}>Gaps</h1>
          <p className="mt-2 break-words text-lg text-ink-soft">{course.name}</p>
        </div>
        <AppLink to={`/course/${course.id}`} className={buttonClassName('secondary', 'sm')}>
          Open course
        </AppLink>
      </header>
      <div className="max-w-3xl">
        <CourseInsightsSection
          key={course.id}
          courseId={course.id}
          heading={false}
          onDisconnected={() => {
            if (!active.current) return;
            const pathname = `/course/${course.id}`;
            void navigate(pathname, { replace: true });
            focusCourseHeading(pathname);
            notify('Disconnected from Gaps.', 'positive');
          }}
        />
      </div>
    </div>
  );
}
