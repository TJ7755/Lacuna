import './index.css';
import { installStaleChunkRecovery } from './pwa/staleChunkRecovery';
import { installSimpleAnalytics, registerProductionServiceWorker } from './webBootstrap';
import { renderApp } from './appRoot';

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
  // The standalone landing tree explicitly mounts the app after its handover.
  // Importing this shared chunk for warm-up must never mount a second root.
  if (document.documentElement.hasAttribute('data-landing-entry')) return;
  installStaleChunkRecovery();
  installSimpleAnalytics();
  void registerProductionServiceWorker();
  if (!import.meta.env.DEV && !document.documentElement.hasAttribute('data-app-starting')) {
    void import('./landingBootstrap');
    return;
  }
  renderApp();
}

if (import.meta.env.DEV) {
  void clearDevelopmentPwaState().finally(start);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
