import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PageArrival, PageArrivalReady } from './PageArrival';

const LoadingContext = createContext<((token: object, pending: boolean) => void) | null>(null);

/** Keep live content while coordinating arrivals and delayed pending feedback. */
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
        {waiting && <DelayedLoadingIndicator />}
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
  return report ? null : <DelayedLoadingIndicator />;
}

/** Fast transitions stay quiet. Static feedback respects every motion preference. */
function DelayedLoadingIndicator() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div role="status" aria-label="Loading" className="flex justify-center py-8 text-ink-faint">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
