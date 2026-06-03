import { lazy, Suspense, useEffect, useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './state/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { seedIfFirstRun } from './db/seed';

// Heavier routes (Recharts, KaTeX, the markdown editor) are split into their own
// chunks so the dashboard loads quickly.
const DeckView = lazy(() => import('./pages/DeckView').then((m) => ({ default: m.DeckView })));
const LearnMode = lazy(() => import('./pages/LearnMode').then((m) => ({ default: m.LearnMode })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

function RouteFallback() {
  return (
    <div className="grid h-[60vh] place-items-center text-ink-faint">
      <span className="animate-pulse font-display text-xl">Loading…</span>
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
        element: (
          <Suspense fallback={<RouteFallback />}>
            <DeckView />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <Settings />
          </Suspense>
        ),
      },
    ],
  },
  {
    // Learn mode is a full-screen, focused experience outside the shell.
    path: '/deck/:deckId/learn',
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

  useEffect(() => {
    seedIfFirstRun().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="grid h-screen place-items-center text-ink-faint">
        <span className="animate-pulse font-display text-2xl">Lacuna</span>
      </div>
    );
  }

  return (
    <ErrorBoundary label="the application">
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
