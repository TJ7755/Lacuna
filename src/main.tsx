import './index.css';
import { installStaleChunkRecovery } from './pwa/staleChunkRecovery';
import {
  installSimpleAnalytics,
  registerProductionServiceWorker,
  shouldHydrateLanding,
} from './webBootstrap';
import { renderApp } from './appRoot';


installStaleChunkRecovery();
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
