import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { cn } from '../components/ui/cn';
import { LacunaIcon, MenuIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { completedIsoDayLabel } from '../../relay/src/insightsDay';
import type { ConnectedGapsCourse } from './connectionStore';
import { GapsSidebar, type GapsPage, type SidebarClass } from './GapsSidebar';
import { Spinner, usePresence } from './gapsUi';
import { pupilScore, mean } from './classInsights';
import type * as CoursesExports from './TeacherCourses';
import type * as ClassExports from './TeacherClassReports';
import type * as KeysExports from './TeacherKeySetup';
import './gaps.css';
import { createClassSessions } from './classSessions';

export type { ClassSession } from './classSessions';

/** What a class page should ask for first; `id` changes with every request. */
export interface ClassRequest {
  kind: 'unlock' | 'setup';
  id: number;
}

type CoursesModule = typeof CoursesExports;
type ClassModule = typeof ClassExports;
type KeysModule = typeof KeysExports;

export function StandaloneTeacherHome() {
  const [courses, setCourses] = useState<ConnectedGapsCourse[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [page, setPage] = useState<GapsPage>({ kind: 'today' });
  const [request, setRequest] = useState<ClassRequest | null>(null);
  // Counts the sidebar's requests to connect a class; Today opens its form for each.
  const [connectRequest, setConnectRequest] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [Courses, setCoursesModule] = useState<CoursesModule | null>(null);
  const [Class, setClassModule] = useState<ClassModule | null>(null);
  const [Keys, setKeysModule] = useState<KeysModule | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sessionCache] = useState(createClassSessions);
  const sessions = sessionCache.sessions;
  useEffect(() => () => sessionCache.clear(), [sessionCache]);
  const [, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const drawer = usePresence(drawerOpen, 220);
  const latestDay = completedIsoDayLabel(Date.now());

  const reload = useCallback(async () => {
    setListFailed(false);
    try {
      const { createGapsConnectionStore } = await import('./connectionStore');
      const store = createGapsConnectionStore();
      try {
        setCourses(await store.list());
      } finally {
        store.close();
      }
    } catch {
      setListFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    void import('./TeacherCourses').then(
      (module) => setCoursesModule(module),
      () => setLoadFailed(true),
    );
  }, [reload]);

  // Lazy screens load on first use, so the opening page stays small.
  useEffect(() => {
    if (page.kind === 'class' && !Class)
      void import('./TeacherClassReports').then(setClassModule, () => setLoadFailed(true));
  }, [page.kind, Class]);
  useEffect(() => {
    if (page.kind === 'recover' && !Keys)
      void import('./TeacherKeySetup').then(setKeysModule, () => setLoadFailed(true));
  }, [page.kind, Keys]);

  // Moving between pages puts focus on the new page's title, as a route change would. A page
  // opened to ask for something puts focus on its first field instead.
  const pageKey = page.kind === 'class' ? page.shareId : page.kind;
  const asking = useRef(false);
  asking.current = Boolean(request) || connectRequest > 0;
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    if (!asking.current)
      document.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true });
  }, [pageKey, Class, Keys]);

  function go(next: GapsPage, ask: ClassRequest['kind'] | 'connect' | null = null) {
    setPage(next);
    setRequest((current) =>
      ask && ask !== 'connect' ? { kind: ask, id: (current?.id ?? 0) + 1 } : null,
    );
    setConnectRequest((value) => (ask === 'connect' ? value + 1 : 0));
    setDrawerOpen(false);
    document.querySelector('main')?.scrollTo({ top: 0 });
  }

  function openClass(course: ConnectedGapsCourse) {
    // A locked class asks for its passphrases straight away: that is the only next step.
    go({ kind: 'class', shareId: course.shareId }, sessions.has(course.shareId) ? null : 'unlock');
  }

  const classes: SidebarClass[] | null =
    courses?.map((course) => {
      const session = sessions.get(course.shareId);
      const latest = session?.days.get(latestDay);
      return {
        course,
        locked: !session,
        count: latest?.reports.length,
        score: latest ? mean(latest.reports.map(({ report }) => pupilScore(report))) : undefined,
      };
    }) ?? null;
  const course =
    page.kind === 'class' ? courses?.find((row) => row.shareId === page.shareId) : undefined;
  const sidebar = (inDrawer: boolean) => (
    <GapsSidebar
      page={page}
      classes={classes}
      collapsed={!inDrawer && collapsed}
      drawer={inDrawer}
      onToday={() => go({ kind: 'today' })}
      onClass={openClass}
      onConnect={() => go({ kind: 'today' }, 'connect')}
      onRecover={() => go({ kind: 'recover' })}
      onAbout={() => go({ kind: 'about' })}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
    />
  );

  let content;
  if (listFailed || loadFailed) {
    content = (
      <div className={`${PAGE_FRAME} pt-12`}>
        <SectionCard className="p-8">
          <p role="alert">Could not open your classes. Reload Gaps to try again.</p>
          <button
            type="button"
            className={`${buttonClassName('secondary')} mt-5`}
            onClick={() => window.location.reload()}
          >
            Reload Gaps
          </button>
        </SectionCard>
      </div>
    );
  } else if (
    !courses ||
    !Courses ||
    (page.kind === 'class' && !Class) ||
    (page.kind === 'recover' && !Keys)
  ) {
    content = (
      <p role="status" className="flex items-center justify-center gap-3 pt-32 text-ink-soft">
        <Spinner /> Opening Gaps…
      </p>
    );
  } else if (page.kind === 'class' && course && Class) {
    content = (
      <Class.ClassPage
        key={course.shareId}
        course={course}
        session={sessions.get(course.shareId) ?? null}
        request={request}
        beginUnlock={() => sessionCache.beginUnlock(course.shareId)}
        onUnlocked={() => {
          // The request is answered, so locking again shows the plain unlock card.
          setRequest(null);
          refresh();
        }}
        onChanged={refresh}
        onLock={() => {
          sessionCache.lock(course.shareId);
          refresh();
        }}
        onRemoved={() => {
          sessionCache.lock(course.shareId);
          go({ kind: 'today' });
          void reload();
        }}
      />
    );
  } else if (page.kind === 'recover' && Keys) {
    content = (
      <Page title="Recover a class">
        <SectionCard className="gaps-rise max-w-xl p-6 md:p-8">
          <Keys.TeacherKeySetup initialMode="restore" />
        </SectionCard>
      </Page>
    );
  } else if (page.kind === 'about') {
    content = (
      <Page title="About Gaps">
        <SectionCard className="gaps-rise max-w-2xl p-6 md:p-8">
          <AboutGaps />
        </SectionCard>
      </Page>
    );
  } else {
    content = (
      <Courses.TodayPage
        courses={courses}
        sessions={sessions}
        day={latestDay}
        connectRequest={connectRequest}
        onOpen={openClass}
        onConnected={(connected) => {
          // A new class is protected next, on its own page, once the list includes it.
          void reload().then(() => go({ kind: 'class', shareId: connected.shareId }, 'setup'));
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:block">{sidebar(false)}</div>

      {drawer.rendered && (
        <div className="fixed inset-0 z-40 md:hidden" data-closing={drawer.closing || undefined}>
          <div
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
            className="gaps-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="gaps-drawer absolute inset-y-0 left-0"
            onKeyDown={(event) => event.key === 'Escape' && setDrawerOpen(false)}
          >
            {sidebar(true)}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 bg-paper px-4 pb-1 pt-2 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5"
          >
            <MenuIcon />
          </button>
          <span className="flex items-center gap-2 font-brand text-lg font-medium leading-none tracking-tight">
            <LacunaIcon aria-hidden="true" className="h-[18px] w-[18px] text-accent-ink" />
            Gaps
          </span>
        </div>
        <main
          className={cn(
            'min-w-0 flex-1 overflow-y-auto overscroll-y-none [scrollbar-gutter:stable]',
            drawer.rendered && 'max-md:overflow-hidden',
          )}
        >
          <div key={pageKey} className="gaps-page">
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${PAGE_FRAME} pb-24`}>
      <header className={`${PAGE_HEADER} md:pt-12`}>
        <h1 tabIndex={-1} data-page-title className={PAGE_TITLE}>
          {title}
        </h1>
      </header>
      {children}
    </div>
  );
}

function AboutGaps() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
      <p>Pupils choose whether to share results. Connecting a class does not turn it on.</p>
      <p>
        Each report covers the last full UTC day and arrives when a pupil next opens Lacuna online.
        Missed days are not backfilled, so no report does not mean no study.
      </p>
      <p>
        Names are typed by pupils and anyone with the class code can send results: treat them as
        study signals, not marks or attendance.
      </p>
      <p>
        Reports are decrypted only on this device. The relay keeps encrypted reports for 84 days;
        physical deletion may lag.
      </p>
      <a
        href="https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md"
        target="_blank"
        rel="noreferrer"
        className="inline-block pt-2 font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
      >
        School data notice
      </a>
    </div>
  );
}
