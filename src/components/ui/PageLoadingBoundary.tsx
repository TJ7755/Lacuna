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
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useLoadingVisibility } from '../../hooks/useLoadingVisibility';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { DelayedFallback } from './DelayedFallback';
import { PageArrival, PageArrivalReady } from './PageArrival';
import { liquidSpring } from './motion';

const LoadingContext = createContext<((token: object, pending: boolean) => void) | null>(null);

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
      <div className="relative">
        <AnimatePresence>
          {visible && <LoadingSurface key="loading">{fallback}</LoadingSurface>}
        </AnimatePresence>
        <div hidden={visible}>
          <PageArrivalReady value={!visible && tokens.size === 0}>
            <Suspense fallback={<PageLoading />}>{children}</Suspense>
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
  useLayoutEffect(() => {
    report?.(token, true);
    return () => report?.(token, false);
  }, [report, token]);
  return report ? null : <DelayedFallback>{fallback}</DelayedFallback>;
}
