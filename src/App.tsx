import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { AccentProvider } from './state/AccentContext';
import { FontScaleProvider } from './state/FontScaleContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { LandingTransition } from './components/layout/LandingTransition';
import { isFirstRun, seedIfFirstRun } from './db/seed';
import { ensurePreMigrationSnapshot, openDatabase } from './db/schema';
import { stampMissingLessonViewModes } from './db/repository';
import { requestPersistentStorage } from './db/persistence';
import { revokeAllCachedUrls } from './db/assetCache';
import { getMotionMultiplier } from './state/motionSpeed';
import { useStorageQuotaWarning } from './hooks/useStorageQuotaWarning';
import { installSyncTriggers } from './sync/triggers';
import { loadMcpBridgeController } from './routes/loaders';
import { router } from './routes/router';
import { useAiSettings } from './ai/settings';
import { AiSessionProvider } from './ai/session/AiSessionContext';
import { createRelayClient } from './ai/relayClient';
import { createRelayAiSession } from './ai/session/relay';

export { router } from './routes/router';

function RouterWithQuotaWarning() {
  useStorageQuotaWarning();
  return <RouterProvider router={router} />;
}

function EnabledAiRouter() {
  const [session] = useState(() => createRelayAiSession({ relay: createRelayClient() }));
  useEffect(() => {
    session.activate();
    return () => session.dispose();
  }, [session]);
  return (
    <AiSessionProvider session={session}>
      <RouterWithQuotaWarning />
    </AiSessionProvider>
  );
}

function RouterWithOptionalAi() {
  const [settings] = useAiSettings();
  return settings.enabled ? <EnabledAiRouter /> : <RouterWithQuotaWarning />;
}

const McpBridgeController = lazy(loadMcpBridgeController);

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
              <RouterWithOptionalAi />
              <LandingTransition />
            </ToastProvider>
          </FontScaleProvider>
        </AccentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
