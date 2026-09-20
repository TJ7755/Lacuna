import { lazy, useState, type ComponentType } from 'react';

type RouteModule = { default: ComponentType };
export type RouteLoader = () => Promise<RouteModule>;

const pendingModules = new WeakMap<RouteLoader, Promise<RouteModule>>();
const loadedModules = new WeakMap<RouteLoader, RouteModule>();

/** Share the actual module between navigation and hover/focus prefetch. */
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

export function lazyRouteModule(loader: RouteLoader): ComponentType {
  const LazyComponent = lazy(() => loadRouteModule(loader));
  return function RouteModuleComponent() {
    // A fulfilled import alone still suspends React.lazy on its first render.
    // Render an already-prefetched module directly, avoiding React 19's fallback
    // delay. Keep the choice stable for this mount so cold loads retain state.
    const [Component] = useState(() => loadedModules.get(loader)?.default ?? LazyComponent);
    return <Component />;
  };
}
