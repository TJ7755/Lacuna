import type { ReactNode } from 'react';
import { PAGE_FRAME, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { SectionCard } from '../components/ui/SectionCard';

/** The teacher presentation accepts local management content only from the in-app caller. */
export function TeacherHomeView({ children }: { children?: ReactNode }) {
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
          Daily class reports
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Connect a published course, prepare its teacher key and give pupils the class code.
          Pupils choose whether to share encrypted results. Delivery requires a trial-enabled
          Lacuna build; ordinary releases do not send reports yet.
        </p>
      </SectionCard>

      {children ?? <TeacherEmptyState standalone />}
    </main>
  );
}

export function TeacherEmptyState({ standalone = false }: { standalone?: boolean }) {
  return (
    <SectionCard aria-labelledby="empty-heading">
      <h2 id="empty-heading" className="font-display text-2xl">
        {standalone ? 'No courses connected' : 'No published courses here'}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Gaps and the main Lacuna site have separate browser storage. Courses, teacher credentials
        and private keys from the main site or desktop app do not appear here automatically. For
        existing courses, keep using the browser or desktop app where you published them.
      </p>
      {standalone && (
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Existing courses saved on this domain are kept, but are not connected to this teacher
          view.
        </p>
      )}
      <a href="https://getlacuna.app/#/share" className={`${buttonClassName('secondary')} mt-5`}>
        Open sharing on the main site
      </a>
    </SectionCard>
  );
}
