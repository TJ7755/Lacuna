import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PageArrival, PageArrivalReady } from './PageArrival';

const LoadingContext = createContext<((token: object, pending: boolean) => void) | null>(null);

/** Readiness coordinates real content entrances; loading never draws a substitute page. */
export function PageLoadingBoundary({
  children,
  pending = false,
  className,
  animateArrival = true,
}: {
  children: ReactNode;
  pending?: boolean;
  className?: string;
  animateArrival?: boolean;
}) {
  const [tokens, setTokens] = useState<ReadonlySet<object>>(() => new Set());
  const report = useCallback((token: object, pending: boolean) => {
    setTokens((current) => {
      if (current.has(token) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(token);
      else next.delete(token);
      return next;
    });
  }, []);
  const waiting = pending || tokens.size > 0;
  const content = <Suspense fallback={<PageLoading />}>{children}</Suspense>;
  return (
    <LoadingContext.Provider value={report}>
      <div className={className} aria-busy={waiting || undefined}>
        <PageArrivalReady value={!waiting}>
          {animateArrival ? <PageArrival>{content}</PageArrival> : content}
        </PageArrivalReady>
      </div>
    </LoadingContext.Provider>
  );
}

/** Report a local data dependency without replacing the surrounding live controls. */
export function PageLoading() {
  const report = useContext(LoadingContext);
  const token = useMemo(() => ({}), []);
  useLayoutEffect(() => {
    report?.(token, true);
    return () => report?.(token, false);
  }, [report, token]);
  return null;
}
