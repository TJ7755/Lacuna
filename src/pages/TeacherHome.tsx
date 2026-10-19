import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClassName } from '../components/ui/buttonStyles';
import { SectionCard } from '../components/ui/SectionCard';
import type { Course } from '../db/types';
import { readShareCredentials } from '../shareLinks/credentials';
import { useCourses } from '../state/useCourseData';
import { TeacherEmptyState, TeacherHomeView } from '../teacher/TeacherHomeView';

export function TeacherHome() {
  const courses = useCourses();
  const published = courses?.filter((course) => course.distribution?.shareId);

  return (
    <TeacherHomeView>
      {published === undefined ? (
        <p role="status" className="text-ink-soft">
          Loading published courses…
        </p>
      ) : published.length === 0 ? (
        <TeacherEmptyState />
      ) : (
        <section aria-labelledby="courses-heading">
          <h2 id="courses-heading" className="mb-4 font-display text-2xl">
            Published courses
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {published.map((course) => (
              <li key={course.id}>
                <PublishedCourse key={course.distribution!.shareId} course={course} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </TeacherHomeView>
  );
}

function PublishedCourse({ course }: { course: Course }) {
  const [ownership, setOwnership] = useState<'loading' | 'owner' | 'missing' | 'error'>('loading');
  const shareId = course.distribution!.shareId!;

  useEffect(() => {
    let active = true;
    void readShareCredentials(shareId).then(
      (credentials) => {
        if (active) setOwnership(credentials ? 'owner' : 'missing');
      },
      () => {
        if (active) setOwnership('error');
      },
    );
    return () => {
      active = false;
    };
  }, [shareId]);

  return (
    <SectionCard as="div" className="h-full">
      <h3 className="break-words font-display text-xl">{course.name}</h3>
      {course.archived && <p className="mt-1 text-sm text-ink-soft">Archived</p>}
      {ownership === 'loading' && <p className="mt-3 text-sm text-ink-soft">Checking ownership…</p>}
      {ownership === 'owner' && (
        <Link
          to={`/share?courseId=${encodeURIComponent(course.id)}`}
          aria-label={`Manage sharing for ${course.name}`}
          className={`${buttonClassName('secondary')} mt-4`}
        >
          Manage sharing
        </Link>
      )}
      {ownership === 'missing' && (
        <p className="mt-3 text-sm text-ink-soft">
          Open the browser or desktop app that published this link to manage it.
        </p>
      )}
      {ownership === 'error' && (
        <p role="alert" className="mt-3 text-sm text-negative">
          Could not check ownership. Reload to try again.
        </p>
      )}
    </SectionCard>
  );
}
