import { prefetchRoute } from './prefetch';
import { useIdlePrefetch } from './useIdlePrefetch';

/** Prefetch recognised routes using the shared idle scheduler. */
export function useIdleRoutePrefetch(paths: readonly string[]) {
  useIdlePrefetch(paths, prefetchRoute);
}
