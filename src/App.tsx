import { buttonClassName } from './components/ui/buttonStyles';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { AccentProvider } from './state/AccentContext';
import { FontScaleProvider } from './state/FontScaleContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { LandingTransition } from './components/layout/LandingTransition';
import { seedWorkPending } from './db/seedFlags';
import { ensurePreMigrationSnapshot, openDatabase, type DbOpenResult } from './db/schema';
import { stampMissingLessonViewModes } from './db/lessonViewModeMigration';
import { requestPersistentStorage } from './db/persistence';
import { revokeAllCachedUrls } from './db/assetCache';
import { getMotionMultiplier } from './state/motionSpeed';
import { useStorageQuotaWarning } from './hooks/useStorageQuotaWarning';
import { loadMcpBridgeController } from './routes/loaders';
import { router } from './routes/router';
import { consumeLandingHandover } from './landingHandover';
import { replacementLifecycle } from './db/replacementLifecycle';

export { router } from './routes/router';

const relayAiDeviceStateParticipant = {
  invalidate: () => undefined,
  quiesce: () => undefined,
  clear: () =>
    import('./ai/session/relay').then(({ clearPersistedRelayAiDeviceState }) =>
      clearPersistedRelayAiDeviceState(),
    ),
};

function RouterWithQuotaWarning() {
  useStorageQuotaWarning();
  return <RouterProvider router={router} />;
}

const McpBridgeController = lazy(loadMcpBridgeController);
const DesktopUpdateController = lazy(() =>
  import('./components/updates/DesktopUpdateController').then((module) => ({
    default: module.DesktopUpdateController,
  })),
);

function isPublicEntry(hash: string): boolean {
  // Public links and comparison CTAs must preserve a new visitor’s destination
  // through first-run setup, including course sharing and material import.
  return /^#\/(?:welcome|landing|download|share|import|teach|s\/[^/?#]+)\/?(?:[?#]|$)/.test(hash);
}

export function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<Exclude<DbOpenResult, { ok: true }> | null>(null);
  const initStarted = useRef(false);

  useEffect(() => replacementLifecycle.register(relayAiDeviceStateParticipant), []);

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
          setInitError(dbOpen);
          return;
        }

        if (!window.electronAPI?.isElectron) {
          // Ask the browser to reduce IndexedDB eviction risk. Electron keeps its
          // profile under app userData, outside the browser-origin eviction model.
          // Fire-and-forget so a slow, rejected or denied request never blocks startup.
          void requestPersistentStorage().catch(() => {});
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
        // settling, which records that the first run has happened. Visitors
        // arriving from the prerendered landing page explicitly chose to enter,
        // so the handover skips the bounce back to the welcome route.
        const enteredFromLanding = consumeLandingHandover();
        // The first-run checks load only while that work remains.
        if (seedWorkPending()) {
          const { isFirstRun, settleFirstRun } = await import('./db/seed');
          if ((await isFirstRun()) && !isPublicEntry(window.location.hash) && !enteredFromLanding) {
            window.location.hash = '#/welcome';
          }

          await settleFirstRun();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to initialise Lacuna:', error);
        }
        setInitError({
          ok: false,
          reason: 'unknown',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred while starting Lacuna.',
        });
        return;
      }

      setReady(true);
      // The daily restore point runs in a worker so large backups do not stall study.
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
    let active = true;
    let dispose: (() => void) | undefined;
    void import('./sync/triggers')
      .then(({ installSyncTriggers }) => {
        if (active) dispose = installSyncTriggers();
      })
      .catch(() => {
        // Automatic sync is optional background work; Settings can still load
        // the same runtime for deliberate sync if this fetch was interrupted.
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || import.meta.env.VITE_GAPS_REPORTING_ENABLED !== 'true') return;
    let active = true;
    let dispose: (() => void) | undefined;
    void import('./insights/delivery')
      .then(({ installInsightsDelivery }) => {
        if (active) dispose = installInsightsDelivery();
      })
      .catch(() => {
        /* Reporting can be retried from course settings. */
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [ready]);

  if (initError) {
    return (
      <div className="grid h-screen place-items-center bg-surface p-8 text-ink">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-2xl tracking-tight">Lacuna could not start</h1>
          <p className="text-ink/70">{initError.message}</p>
          {initError.reason === 'quota' && (
            <p role="alert" className="text-ink/70">
              Do not clear Lacuna site data — that would delete your cards and progress. Free space
              in your browser or operating system, or leave private browsing, then reload Lacuna.
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonClassName('primary')}
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
              {window.electronAPI?.updater && (
                <Suspense fallback={null}>
                  <DesktopUpdateController />
                </Suspense>
              )}
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
