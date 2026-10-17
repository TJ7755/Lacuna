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
import { useLoadingVisibility } from '../../hooks/useLoadingVisibility';
import { DelayedFallback } from './DelayedFallback';

const LoadingContext = createContext<((token: object, pending: boolean) => void) | null>(null);

/** One clock spans archive checks, chunk loading and page data. Chrome remains outside it. */
export function PageLoadingBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [tokens, setTokens] = useState<ReadonlySet<object>>(() => new Set());
  const report = useCallback((token: object, pending: boolean) => {
    setTokens((current) => {
      const next = new Set(current);
      if (pending) next.add(token);
      else next.delete(token);
      return next;
    });
  }, []);
  const visible = useLoadingVisibility(tokens.size > 0);
  return (
    <LoadingContext.Provider value={report}>
      {visible && (
        <div role="status" aria-label="Loading page">
          {fallback}
        </div>
      )}
      <div hidden={visible}>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </div>
    </LoadingContext.Provider>
  );
}

/** Page data branches report to the same boundary as the route's Suspense fallback. */
export function PageLoading({ fallback }: { fallback?: ReactNode }) {
  const report = useContext(LoadingContext);
  const token = useMemo(() => ({}), []);
  useLayoutEffect(() => {
    report?.(token, true);
    return () => report?.(token, false);
  }, [report, token]);
  return report ? null : <DelayedFallback>{fallback}</DelayedFallback>;
}
