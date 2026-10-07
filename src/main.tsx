import './index.css';
import { installStaleChunkRecovery } from './pwa/staleChunkRecovery';
import { installHostedFontLinks, installSimpleAnalytics, registerProductionServiceWorker } from './webBootstrap';
import { renderApp } from './appRoot';
// Flags only: the landing decision below never pulls the database into the initial graph.
import { SEED_FLAG_KEY } from './db/seedFlags';


installStaleChunkRecovery();
installHostedFontLinks();
installSimpleAnalytics();
void registerProductionServiceWorker();

async function clearDevelopmentPwaState(): Promise<void> {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  try {
    const [registrations, cacheNames] = await Promise.all([
      navigator.serviceWorker.getRegistrations(),
      'caches' in window ? caches.keys() : Promise.resolve([]),
    ]);

    await Promise.all([
      ...registrations.map((registration) => registration.unregister()),
      ...cacheNames.map((cacheName) => caches.delete(cacheName)),
    ]);
  } catch {
    // Cache cleanup is best-effort; a browser policy must not prevent development startup.
  }
}

/** First-visit browsers hydrate the prerendered landing page; the packaged app,
 * in-app hash routes and returning browsers boot the study app directly. */
function shouldHydrateLanding(): boolean {
  if (window.electronAPI?.isElectron) return false;
  if (window.location.hash.length > 1) return false;
  try {
    // A previous start seeded the example course, so this browser already knows
    // the app: skip the marketing flash and go straight to the dashboard.
    if (localStorage.getItem(SEED_FLAG_KEY)) return false;
  } catch {
    // Storage may be unavailable; fall through to the prerender check.
  }
  return !!document.getElementById('root')?.querySelector('.landing-page');
}

function start(): void {
  if (!import.meta.env.DEV && shouldHydrateLanding()) {
    // Keep the landing chunk out of the application shell: it loads only for
    // the prerendered first visit, never for dashboard starts.
    void import('./pages/landing/entry-client').then(({ hydrateLanding }) =>
      hydrateLanding(),
    );
    return;
  }
  renderApp();
}

if (import.meta.env.DEV) {
  void clearDevelopmentPwaState().finally(start);
} else {
  start();
}
