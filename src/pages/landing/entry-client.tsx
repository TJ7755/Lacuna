import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { LandingRoot } from './LandingRoot';
import { markLandingHandover } from '../../landingHandover';
import { installHostedFontLinks, installSimpleAnalytics } from '../../webBootstrap';
import '../../index.css';

let landingRoot: Root | null = null;
let upgraded = false;
let urlWatching = false;
let prefetched = false;

function onUrlChange(): void {
  // In-page anchors (for example #landing-product) stay on the landing page.
  // Anything addressing the study app through its hash routes boots the full app.
  if (!window.location.hash.startsWith('#/')) return;
  void upgradeToApp();
}

function watchUrl(): void {
  if (urlWatching) return;
  urlWatching = true;
  // The landing tree navigates through the hash router, whose pushState-based
  // transitions never fire hashchange. Patch both history methods so any
  // in-app navigation hands over, and keep the event listeners for manual hash
  // edits and back/forward travel.
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args) => {
    originalPushState(...args);
    onUrlChange();
  };
  window.history.replaceState = (...args) => {
    originalReplaceState(...args);
    onUrlChange();
  };
  window.addEventListener('hashchange', onUrlChange);
  window.addEventListener('popstate', onUrlChange);
}

async function upgradeToApp(): Promise<void> {
  if (upgraded) return;
  upgraded = true;
  // Record the explicit entry before booting: the app's first-run redirect
  // must honour it instead of bouncing the visitor back to the welcome route.
  markLandingHandover();
  prefetchApp();
  const { renderApp } = await import('../../appRoot');
  landingRoot?.unmount();
  landingRoot = null;
  renderApp();
}

/**
 * Warm the study-app chunk while the visitor reads the landing page so entering
 * the app feels instant. Modules only: seeding stays with the app bootstrap so
 * the database upgrade snapshot order is unchanged.
 */
function prefetchApp(): void {
  if (prefetched) return;
  prefetched = true;
  void import('../../appRoot').catch(() => {
    // The handover import retries; a failed prefetch must not break the page.
  });
}

/** Hydrate the prerendered landing markup; hand over to the app on navigation. */
export function hydrateLanding(): void {
  installHostedFontLinks();
  installSimpleAnalytics();
  const container = document.getElementById('root')!;
  if (container.querySelector('.landing-page')) {
    landingRoot = hydrateRoot(container, <LandingRoot />);
  } else {
    landingRoot = createRoot(container);
    landingRoot.render(<LandingRoot />);
  }
  watchUrl();
  onUrlChange();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => prefetchApp());
  } else {
    window.setTimeout(() => prefetchApp(), 1000);
  }
}
