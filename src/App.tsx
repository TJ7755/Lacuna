import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LazyRoute } from './routes/LazyRoute';
import { m as motion } from 'motion/react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { AccentProvider } from './state/AccentContext';
import { FontScaleProvider } from './state/FontScaleContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { RouteTransition } from './components/layout/RouteTransition';
import { LandingTransition } from './components/layout/LandingTransition';
import { LegacyBankRedirect } from './routes/LegacyBankRedirect';
import { Dashboard } from './pages/Dashboard';
import { isFirstRun, seedIfFirstRun } from './db/seed';
import { ensurePreMigrationSnapshot, openDatabase } from './db/schema';
import { stampMissingLessonViewModes } from './db/repository';
import { requestPersistentStorage } from './db/persistence';
import { revokeAllCachedUrls } from './db/assetCache';
import { getMotionMultiplier } from './state/motionSpeed';
import { useStorageQuotaWarning } from './hooks/useStorageQuotaWarning';
import { installSyncTriggers } from './sync/triggers';
import { NotFound } from './pages/NotFound';
import {
  loadAnalytics,
  loadCardEditor,
  loadCardsPage,
  loadCourseAnalytics,
  loadCoursePath,
  loadCourseSettings,
  loadCourseStudyFlow,
  loadHelpPage,
  loadLessonView,
  loadLearnMode,
  loadMcpBridgeController,
  loadMergeReviewPanel,
  loadMethod,
  loadOcclusionEditor,
  loadQuestionEditor,
  loadQuestionLearnMode,
  loadQuestionsPage,
  loadSearchPage,
  loadSequenceEditor,
  loadSettings,
  loadSharePage,
  loadWelcome,
} from './routes/loaders';

function RouterWithQuotaWarning() {
  useStorageQuotaWarning();
  return <RouterProvider router={router} />;
}

// Keep the dashboard as the only eager page. Every other route is loaded on demand
// so optional charts, importers, QR tooling and long-form settings/help content do
// not increase launch parse time.
const Settings = lazy(loadSettings);
const SearchPage = lazy(loadSearchPage);
const SharePage = lazy(loadSharePage);
const Analytics = lazy(loadAnalytics);
const HelpPage = lazy(loadHelpPage);
const LearnMode = lazy(loadLearnMode);
const CourseStudyFlow = lazy(loadCourseStudyFlow);
const CardEditor = lazy(loadCardEditor);
const SequenceEditor = lazy(loadSequenceEditor);
const OcclusionEditor = lazy(loadOcclusionEditor);
const CourseSettings = lazy(loadCourseSettings);
const CourseAnalytics = lazy(loadCourseAnalytics);
const CoursePath = lazy(loadCoursePath);
const LessonView = lazy(loadLessonView);
const CardsPage = lazy(loadCardsPage);
const QuestionsPage = lazy(loadQuestionsPage);
const QuestionEditor = lazy(loadQuestionEditor);
const QuestionLearnMode = lazy(loadQuestionLearnMode);
const MergeReviewPanel = lazy(loadMergeReviewPanel);
const Welcome = lazy(loadWelcome);
const Method = lazy(loadMethod);
const McpBridgeController = lazy(loadMcpBridgeController);

// Hash routing keeps the app deployable as plain static files with no server rewrites.
export const router = createHashRouter([
  {
    element: <RouteTransition />,
    children: [
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
              <LazyRoute>
                <Settings />
              </LazyRoute>
            ),
          },
          {
            path: 'search',
            element: (
              <LazyRoute>
                <SearchPage />
              </LazyRoute>
            ),
          },
          {
            path: 'share',
            element: (
              <LazyRoute>
                <SharePage />
              </LazyRoute>
            ),
          },
          {
            path: 'analytics',
            element: (
              <LazyRoute>
                <Analytics />
              </LazyRoute>
            ),
          },
          {
            path: 'help',
            element: (
              <LazyRoute>
                <HelpPage />
              </LazyRoute>
            ),
          },
          {
            path: 'study',
            element: <Navigate to="/" replace />,
          },
          {
            path: 'course/:courseId',
            element: (
              <LazyRoute>
                <CoursePath />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/lesson/:lessonId',
            element: (
              <LazyRoute>
                <LessonView />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/bank',
            element: <LegacyBankRedirect />,
          },
          {
            path: 'course/:courseId/cards',
            element: (
              <LazyRoute>
                <CardsPage />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/questions',
            element: (
              <LazyRoute>
                <QuestionsPage />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/questions/new',
            element: (
              <LazyRoute>
                <QuestionEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/questions/:questionId/edit',
            element: (
              <LazyRoute>
                <QuestionEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/cards/new',
            element: (
              <LazyRoute>
                <CardEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/cards/:cardId/edit',
            element: (
              <LazyRoute>
                <CardEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/settings',
            element: (
              <LazyRoute>
                <CourseSettings />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/analytics',
            element: (
              <LazyRoute>
                <CourseAnalytics />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/updates',
            element: (
              <LazyRoute>
                <MergeReviewPanel />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/new',
            element: (
              <LazyRoute>
                <CardEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/:cardId/edit',
            element: (
              <LazyRoute>
                <CardEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/sequence/new',
            element: (
              <LazyRoute>
                <SequenceEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/sequence/:sequenceId/edit',
            element: (
              <LazyRoute>
                <SequenceEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/sequence/new',
            element: (
              <LazyRoute>
                <SequenceEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/occlusion/new',
            element: (
              <LazyRoute>
                <OcclusionEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/occlusion/:occlusionId/edit',
            element: (
              <LazyRoute>
                <OcclusionEditor />
              </LazyRoute>
            ),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/occlusion/new',
            element: (
              <LazyRoute>
                <OcclusionEditor />
              </LazyRoute>
            ),
          },
          {
            path: '*',
            element: <NotFound />,
          },
        ],
      },
      {
        // The landing page is a full-screen editorial experience outside the shell.
        path: '/welcome',
        element: (
          <ErrorBoundary label="the landing page">
            <LazyRoute>
              <Welcome />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // The technical account belongs to the landing page, outside the app shell.
        path: '/method',
        element: (
          <ErrorBoundary label="the technical account">
            <LazyRoute>
              <Method />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // Question practice remains a separate post-instruction session while its
        // scheduling evidence is being validated. It deliberately does not enter
        // the Card-based course conductor or Path yet.
        path: '/course/:courseId/questions/learn',
        element: (
          <ErrorBoundary label="the Question session">
            <LazyRoute>
              <QuestionLearnMode />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // Persistent course conductor. It owns lesson/Practice transitions and
        // remains mounted until the learner explicitly finishes the study period.
        path: '/course/:courseId/study',
        element: (
          <ErrorBoundary label="the course study flow">
            <LazyRoute>
              <CourseStudyFlow />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // Learn mode is a full-screen, focused experience outside the shell. The
        // global, cross-course "Today" session (no deckId param).
        path: '/learn',
        element: (
          <ErrorBoundary label="the Learn session">
            <LazyRoute>
              <LearnMode />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // A course Practice session selected by the curricular objective engine.
        path: '/course/:courseId/learn',
        element: (
          <ErrorBoundary label="the Learn session">
            <LazyRoute>
              <LearnMode />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
      {
        // A Simple lesson session for cards not yet exposed in that lesson.
        path: '/lesson/:lessonId/learn',
        element: (
          <ErrorBoundary label="the Learn session">
            <LazyRoute>
              <LearnMode />
            </LazyRoute>
          </ErrorBoundary>
        ),
      },
    ],
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

        // Ask the browser to reduce IndexedDB eviction risk. Fire-and-forget so
        // a slow, rejected or denied request never blocks startup. Repeating the
        // request on later launches is deliberate because a previous denial does
        // not mean the browser will never grant persistence.
        void requestPersistentStorage().catch(() => {});

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
      void import('./db/backups')
        .then(({ autoBackupIfStale }) => autoBackupIfStale())
        .catch(() => {
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

  useEffect(() => {
    if (!ready) return;
    const dispose = installSyncTriggers();
    return dispose;
  }, [ready]);

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
              {window.electronAPI?.isElectron && (
                <Suspense fallback={null}>
                  <McpBridgeController />
                </Suspense>
              )}
              <RouterWithQuotaWarning />
              <LandingTransition />
            </ToastProvider>
          </FontScaleProvider>
        </AccentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
