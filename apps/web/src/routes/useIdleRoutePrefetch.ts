import { useEffect } from 'react';
import { prefetchRoute } from './prefetch';
import { scheduleIdlePrefetch } from './idlePrefetch';

/** Hover/focus already prefetches; idle work also covers touch and immediate clicks. */
export function useIdleRoutePrefetch(paths: readonly string[]) {
  const key = paths.join('\n');
  useEffect(() => scheduleIdlePrefetch(key.split('\n').filter(Boolean), prefetchRoute), [key]);
}
