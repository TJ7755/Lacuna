import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PAGE_FRAME, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { SectionCard } from '../components/ui/SectionCard';
import type { Course } from '../db/types';
import { readShareCredentials } from '../shareLinks/credentials';
import { useCourses } from '../state/useCourseData';

export function TeacherHome() {
  const courses = useCourses();
  const published = courses?.filter((course) => course.distribution?.shareId);

  return (
    <main className={`${PAGE_FRAME} min-h-screen space-y-6 py-8 text-ink md:py-12`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-ink-soft">Lacuna for teachers</p>
          <h1 className={PAGE_TITLE}>Gaps</h1>
          <p className="mt-3 text-lg text-ink-soft">Class insights from the courses you share.</p>
        </div>
        <a href="https://getlacuna.app/#/" className={buttonClassName('secondary')}>
          Open Lacuna
        </a>
      </header>

      <SectionCard aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" className="font-display text-2xl">
          Weekly delivery is not connected yet
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Gaps is being prepared for the school trial. No pupil results are collected or displayed
          here yet.
        </p>
      </SectionCard>

      {published === undefined ? (
        <p role="status" className="text-ink-soft">
          Loading published courses…
        </p>
      ) : published.length === 0 ? (
        <SectionCard aria-labelledby="empty-heading">
          <h2 id="empty-heading" className="font-display text-2xl">
            No published courses here
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-ink-soft">
            Gaps and the main Lacuna site have separate browser storage. Courses and teacher
            credentials from the main site or desktop app do not appear here automatically. For
            existing courses, keep using the browser or desktop app where you published them.
          </p>
          <a
            href="https://getlacuna.app/#/share"
            className={`${buttonClassName('secondary')} mt-5`}
          >
            Open sharing on the main site
          </a>
        </SectionCard>
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
    </main>
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
