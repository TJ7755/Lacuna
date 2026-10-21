import { lazy, useState, type ComponentType } from 'react';
import { recoverFromChunkFailure } from '../pwa/staleChunkRecovery';

type RouteModule = { default: ComponentType };
export type RouteLoader = () => Promise<RouteModule>;

const pendingModules = new WeakMap<RouteLoader, Promise<RouteModule>>();
const loadedModules = new WeakMap<RouteLoader, RouteModule>();

/** Read completed prefetches without introducing a first-render suspense delay. */
export function getLoadedRouteModule<T extends RouteLoader>(
  loader: T,
): Awaited<ReturnType<T>> | undefined {
  return loadedModules.get(loader) as Awaited<ReturnType<T>> | undefined;
}

/** Share the actual module between navigation and hover/focus prefetch. */
export function loadRouteModule<T extends RouteLoader>(loader: T): ReturnType<T>;
export function loadRouteModule(loader: RouteLoader): Promise<RouteModule> {
  const pending = pendingModules.get(loader);
  if (pending) return pending;
  const request = loader().then(
    (module) => {
      loadedModules.set(loader, module);
      return module;
    },
    (error: unknown) => {
      pendingModules.delete(loader);
      throw error;
    },
  );
  pendingModules.set(loader, request);
  return request;
}

function recoverRouteImport(error: unknown): Promise<never> {
  const isImportFailure =
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
      error.message,
    );
  if (!isImportFailure) throw error;
  return recoverFromChunkFailure().then((recovered) => {
    if (!recovered) throw error;
    // React.lazy retains rejected promises. Keep Suspense visible until the
    // replacement document arrives, after stale worker/cache cleanup finishes.
    return new Promise<never>(() => {});
  });
}

export function lazyRouteModule(loader: RouteLoader): ComponentType {
  // Recover on navigation, never on speculative hover/focus prefetches. Catching
  // here covers Vite's production preload rejection as well as dev imports.
  const LazyComponent = lazy(() => loadRouteModule(loader).catch(recoverRouteImport));
  return function RouteModuleComponent() {
    // A fulfilled import alone still suspends React.lazy on its first render.
    // Render an already-prefetched module directly, avoiding React 19's fallback
    // delay. Keep the choice stable for this mount so cold loads retain state.
    const [Component] = useState(() => {
      const loaded = loadedModules.get(loader);
      return loaded?.default ?? LazyComponent;
    });
    return <Component />;
  };
}
