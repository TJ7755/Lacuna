import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { AccentProvider } from './state/AccentContext';
import { FontScaleProvider } from './state/FontScaleContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { LandingTransition } from './components/layout/LandingTransition';
import { Dashboard } from './pages/Dashboard';
import { isFirstRun, seedIfFirstRun } from './db/seed';
import { autoBackupIfStale } from './db/backups';
import { ensurePreMigrationSnapshot, openDatabase } from './db/schema';
import { stampMissingLessonViewModes } from './db/repository';
import { requestPersistentStorage } from './db/persistence';
import { revokeAllCachedUrls } from './db/assetCache';
import { getMotionMultiplier } from './state/motionSpeed';
import { useStorageQuotaWarning } from './hooks/useStorageQuotaWarning';
import { McpBridgeController } from './components/mcp/McpBridgeController';

function RouterWithQuotaWarning() {
  useStorageQuotaWarning();
  return <RouterProvider router={router} />;
}

// Keep the dashboard as the only eager page. Every other route is loaded on demand
// so optional charts, importers, QR tooling and long-form settings/help content do
// not increase launch parse time.
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const SharePage = lazy(() =>
  import('./pages/SharePage').then((m) => ({ default: m.SharePage })),
);
const Analytics = lazy(() =>
  import('./pages/Analytics').then((m) => ({ default: m.Analytics })),
);
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const StudyToday = lazy(() =>
  import('./pages/StudyToday').then((m) => ({ default: m.StudyToday })),
);
const LearnMode = lazy(() => import('./pages/LearnMode').then((m) => ({ default: m.LearnMode })));
const CourseStudyFlow = lazy(() =>
  import('./pages/CourseStudyFlow').then((m) => ({ default: m.CourseStudyFlow })),
);
const CardEditor = lazy(() =>
  import('./pages/CardEditor').then((m) => ({ default: m.CardEditor })),
);
const SequenceEditor = lazy(() =>
  import('./pages/SequenceEditor').then((m) => ({ default: m.SequenceEditor })),
);
const CourseSettings = lazy(() =>
  import('./pages/CourseSettings').then((m) => ({ default: m.CourseSettings })),
);
const CourseAnalytics = lazy(() =>
  import('./pages/CourseAnalytics').then((m) => ({ default: m.CourseAnalytics })),
);
const CoursePath = lazy(() =>
  import('./pages/CoursePath').then((m) => ({ default: m.CoursePath })),
);
const LessonView = lazy(() =>
  import('./pages/LessonView').then((m) => ({ default: m.LessonView })),
);
const QuestionBank = lazy(() =>
  import('./pages/QuestionBank').then((m) => ({ default: m.QuestionBank })),
);
const Welcome = lazy(() => import('./pages/Welcome').then((m) => ({ default: m.Welcome })));
const Method = lazy(() => import('./pages/Method').then((m) => ({ default: m.Method })));

function RouteFallback() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <div className="w-full max-w-xs space-y-3">
        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-ink/5" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-ink/5" />
        <div className="h-4 w-5/6 animate-pulse rounded-lg bg-ink/5" />
        <div className="h-32 w-full animate-pulse rounded-xl bg-ink/5" />
      </div>
    </div>
  );
}

// Hash routing keeps the app deployable as plain static files with no server rewrites.
const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'deck/:deckId',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <Settings />
          </Suspense>
        ),
      },
      {
        path: 'search',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SearchPage />
          </Suspense>
        ),
      },
      {
        path: 'share',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SharePage />
          </Suspense>
        ),
      },
      {
        path: 'analytics',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <Analytics />
          </Suspense>
        ),
      },
      {
        path: 'help',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <HelpPage />
          </Suspense>
        ),
      },
      {
        path: 'study',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <StudyToday />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CoursePath />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/lesson/:lessonId',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <LessonView />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/bank',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <QuestionBank />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/cards/new',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CardEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/cards/:cardId/edit',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CardEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/settings',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CourseSettings />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/analytics',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CourseAnalytics />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/lesson/:lessonId/cards/new',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CardEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/lesson/:lessonId/cards/:cardId/edit',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <CardEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/sequence/new',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SequenceEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/sequence/:sequenceId/edit',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SequenceEditor />
          </Suspense>
        ),
      },
      {
        path: 'course/:courseId/lesson/:lessonId/sequence/new',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SequenceEditor />
          </Suspense>
        ),
      },
    ],
  },
  {
    // The landing page is a full-screen editorial experience outside the shell.
    path: '/welcome',
    element: (
      <ErrorBoundary label="the landing page">
        <Suspense fallback={<RouteFallback />}>
          <Welcome />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    // The technical account belongs to the landing page, outside the app shell.
    path: '/method',
    element: (
      <ErrorBoundary label="the technical account">
        <Suspense fallback={<RouteFallback />}>
          <Method />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    // Persistent course conductor. It owns lesson/Practice transitions and
    // remains mounted until the learner explicitly finishes the study period.
    path: '/course/:courseId/study',
    element: (
      <ErrorBoundary label="the course study flow">
        <Suspense fallback={<RouteFallback />}>
          <CourseStudyFlow />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    // Learn mode is a full-screen, focused experience outside the shell. The
    // global, cross-course "Today" session (no deckId param).
    path: '/learn',
    element: (
      <ErrorBoundary label="the Learn session">
        <Suspense fallback={<RouteFallback />}>
          <LearnMode />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    // A course Practice session selected by the curricular objective engine.
    path: '/course/:courseId/learn',
    element: (
      <ErrorBoundary label="the Learn session">
        <Suspense fallback={<RouteFallback />}>
          <LearnMode />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    // A Simple lesson session for cards not yet exposed in that lesson.
    path: '/lesson/:lessonId/learn',
    element: (
      <ErrorBoundary label="the Learn session">
        <Suspense fallback={<RouteFallback />}>
          <LearnMode />
        </Suspense>
      </ErrorBoundary>
    ),
  },
]);

export function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    void (async () => {
      try {
        // Detect any pending schema upgrade and capture a committed snapshot before
        // the destructive migration runs. This must happen before the first Dexie
        // query triggers the database open.
        await ensurePreMigrationSnapshot();

        // Explicitly open the database so corruption or quota errors surface here
        // rather than deep inside a component render.
        const dbOpen = await openDatabase();
        if (!dbOpen.ok) {
          setInitError(dbOpen.message);
          return;
        }

        // Request persistent storage once on first run so the browser does not
        // silently evict IndexedDB data under storage pressure.
        try {
          if (!localStorage.getItem('lacuna-persist-requested')) {
            await requestPersistentStorage();
            localStorage.setItem('lacuna-persist-requested', '1');
          }
        } catch {
          // localStorage may be unavailable in private browsing or with storage
          // restrictions; the app should still initialise without persistence.
        }

        // One-shot migration: the site-wide "open lessons in edit mode" default
        // (formerly in Settings) has been removed in favour of a per-course
        // setting only. Stamp any course that predates this with the old
        // global default's last value so behaviour does not change for
        // existing users — see stampMissingLessonViewModes and
        // src/course/lessonViewMode.ts.
        try {
          if (!localStorage.getItem('lacuna-lesson-view-mode-migrated')) {
            await stampMissingLessonViewModes();
            localStorage.setItem('lacuna-lesson-view-mode-migrated', '1');
          }
        } catch {
          // Best-effort — courses without an explicit mode fall back to
          // 'study' via resolveLessonViewMode() regardless.
        }

        // A genuinely fresh browser opens on the landing page; anyone with
        // existing data goes straight to the app they know. Decided before
        // seeding, because the seed itself creates a course.
        if ((await isFirstRun()) && !window.location.hash.startsWith('#/welcome')) {
          window.location.hash = '#/welcome';
        }

        await seedIfFirstRun();
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('Failed to initialise Lacuna:', error);
        }
        setInitError(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while starting Lacuna.',
        );
        return;
      }

      setReady(true);
      // Take a daily restore point in the background; never blocks the UI.
      void autoBackupIfStale().catch(() => {
        // Background backup failures are non-fatal.
      });
    })();
  }, []);

  useEffect(() => {
    const handler = () => revokeAllCachedUrls();
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    };
  }, []);

  if (initError) {
    return (
      <div className="grid h-screen place-items-center bg-surface p-8 text-ink">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-2xl tracking-tight">Lacuna could not start</h1>
          <p className="text-ink/70">{initError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition hover:opacity-90 active:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    const m = getMotionMultiplier();
    return (
      <div className="grid h-screen place-items-center text-ink">
        <motion.span
          className="font-display text-3xl tracking-tight"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: [0, 1, 1, 0.6, 1], y: 0, scale: 1 }}
          transition={{
            opacity: { duration: 1.6 * m, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 0.4 * m, ease: [0.16, 1, 0.3, 1] },
            scale: { duration: 0.4 * m, ease: [0.16, 1, 0.3, 1] },
          }}
        >
          Lacuna
        </motion.span>
      </div>
    );
  }

  return (
    <ErrorBoundary label="the application">
      <ThemeProvider>
        <AccentProvider>
          <FontScaleProvider>
            <ToastProvider>
              {window.electronAPI?.isElectron && <McpBridgeController />}
              <RouterWithQuotaWarning />
              <LandingTransition />
            </ToastProvider>
          </FontScaleProvider>
        </AccentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
