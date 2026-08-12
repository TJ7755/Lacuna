import { Suspense, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';

/**
 * Short enough to overlap the shell's own route transition without reading as a
 * second, slower animation stacked on top of it.
 */
const CONTENT_FADE_S = 0.14;

function RouteFallback() {
  return (
    <DelayedFallback>
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <div className="w-full max-w-xs space-y-3">
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-ink/5" />
          <div className="h-4 w-full animate-pulse rounded-lg bg-ink/5" />
          <div className="h-4 w-5/6 animate-pulse rounded-lg bg-ink/5" />
          <div className="h-32 w-full animate-pulse rounded-xl bg-ink/5" />
        </div>
      </div>
    </DelayedFallback>
  );
}

/**
 * Fades route content in as it mounts. `AppShell` already crossfades navigation, but
 * it animates whatever the boundary is showing at the time — on a cold chunk fetch
 * that is the placeholder, and the real content then replaced it with no transition
 * at all. An instant swap reads as a flicker rather than as speed, so making loading
 * faster made the seam more obvious rather than less.
 */
function RouteContent({ children }: { children: ReactNode }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  return (
    <motion.div
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: CONTENT_FADE_S * m, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A lazily loaded route: a placeholder that will not flash, and content that settles
 * in rather than snapping. Replaces the repeated Suspense-plus-fallback pairs that
 * every lazy route in `App.tsx` previously spelled out.
 */
export function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <RouteContent>{children}</RouteContent>
    </Suspense>
  );
}
