import type { ReactNode } from 'react';
import { useDelayedPending } from '../../hooks/useDelayedPending';
import { PageArrival, PageArrivalReady } from './PageArrival';

/** Delayed entry for a placeholder whose surrounding surface owns its exit. */
export function DelayedFallback({ children }: { children: ReactNode }) {
  const visible = useDelayedPending(true);
  if (!visible) return null;
  return (
    <PageArrivalReady value={true}>
      <PageArrival className="[&_.animate-pulse]:animate-none [&_.gaps-skeleton]:animate-none">
        {children}
      </PageArrival>
    </PageArrivalReady>
  );
}
