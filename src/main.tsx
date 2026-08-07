import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import { App } from './App';

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

function renderApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LazyMotion features={domAnimation}>
        <App />
        <Analytics />
      </LazyMotion>
    </StrictMode>,
  );
}

if (import.meta.env.DEV) {
  void clearDevelopmentPwaState().finally(renderApp);
} else {
  renderApp();
}
