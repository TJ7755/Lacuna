import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useLoadingVisibility } from '../../hooks/useLoadingVisibility';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { DelayedFallback } from './DelayedFallback';
import { PageArrival, PageArrivalReady } from './PageArrival';
import { liquidSpring } from './motion';

const LoadingContext = createContext<
  ((token: object, pending: boolean, fallback?: ReactNode) => void) | null
>(null);

function LoadingSurface({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const [speed] = useMotionSpeed();
  return (
    <motion.div
      role={present ? 'status' : undefined}
      aria-label={present ? 'Loading page' : undefined}
      aria-hidden={!present || undefined}
      inert={!present}
      className="left-0 top-0 w-full [&_.animate-pulse]:animate-none"
      style={{ position: present ? 'relative' : 'absolute', pointerEvents: 'none' }}
      exit={{ opacity: 0 }}
      transition={liquidSpring(speedMultiplier(speed))}
    >
      <PageArrival>{children}</PageArrival>
    </motion.div>
  );
}

/** One clock spans archive checks, chunk loading and page data. Chrome remains outside it. */
export function PageLoadingBoundary({
  children,
  fallback,
  pending = false,
  minimumMs = 0,
  className,
}: {
  children: ReactNode;
  fallback: ReactNode;
  pending?: boolean;
  minimumMs?: number;
  className?: string;
}) {
  const [loading, setLoading] = useState<{
    tokens: ReadonlyMap<object, ReactNode>;
    fallback?: ReactNode;
  }>(() => ({ tokens: new Map() }));
  const report = useCallback((token: object, pending: boolean, fallback?: ReactNode) => {
    setLoading((current) => {
      const tokens = new Map(current.tokens);
      if (pending) tokens.set(token, fallback);
      else tokens.delete(token);
      return {
        tokens,
        fallback: pending
          ? (fallback ?? (current.tokens.size > 0 ? current.fallback : undefined))
          : current.fallback,
      };
    });
  }, []);
  const waiting = pending || loading.tokens.size > 0;
  const visible = useLoadingVisibility(waiting, 200, minimumMs);
  return (
    <LoadingContext.Provider value={report}>
      <div className={className ? `relative ${className}` : 'relative'}>
        <AnimatePresence>
          {visible && <LoadingSurface key="loading">{loading.fallback ?? fallback}</LoadingSurface>}
        </AnimatePresence>
        <div hidden={visible}>
          <PageArrivalReady value={!visible && !waiting}>
            <PageArrival>
              <Suspense fallback={<PageLoading />}>{children}</Suspense>
            </PageArrival>
          </PageArrivalReady>
        </div>
      </div>
    </LoadingContext.Provider>
  );
}

/** Page data branches report to the same boundary as the route's Suspense fallback. */
export function PageLoading({ fallback }: { fallback?: ReactNode }) {
  const report = useContext(LoadingContext);
  const token = useMemo(() => ({}), []);
  const placeholder = useRef(fallback);
  useLayoutEffect(() => {
    report?.(token, true, placeholder.current);
    return () => report?.(token, false);
  }, [report, token]);
  return report ? null : <DelayedFallback>{fallback}</DelayedFallback>;
}
