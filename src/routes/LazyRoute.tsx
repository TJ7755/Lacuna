import { PAGE_FRAME, PAGE_HEADER } from '../components/course/coursePageLayout';
import type { ReactNode } from 'react';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
import { Skeleton } from '../components/ui/Skeleton';

function RouteFallback() {
  return (
    <div className={`${PAGE_FRAME} pb-10`}>
      <header className={PAGE_HEADER}>
        <Skeleton className="h-11 w-64 max-w-full" />
      </header>
      <div className="space-y-4 rounded-3xl bg-surface p-6 card-surface">
        <Skeleton className="h-6 w-48 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full rounded-3xl" />
      </div>
    </div>
  );
}

/** Guard, chunk and page data share one loading surface and one reveal. */
export function LazyRoute({
  children,
  animateArrival = true,
}: {
  children: ReactNode;
  animateArrival?: boolean;
}) {
  return (
    <PageLoadingBoundary fallback={<RouteFallback />} animateArrival={animateArrival}>
      {children}
    </PageLoadingBoundary>
  );
}
