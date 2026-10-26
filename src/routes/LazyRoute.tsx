import type { ReactNode } from 'react';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';

export function LazyRoute({
  children,
  animateArrival = true,
}: {
  children: ReactNode;
  animateArrival?: boolean;
}) {
  return <PageLoadingBoundary animateArrival={animateArrival}>{children}</PageLoadingBoundary>;
}
