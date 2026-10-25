import type { ReactNode } from 'react';

/** Keep existing reports and controls mounted while their next read completes. */
export function GapsLoadingBoundary({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return <div aria-busy={pending || undefined}>{children}</div>;
}
