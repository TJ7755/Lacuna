import { lazy, Suspense } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { hasLandingArrival } from './LandingTransition';

const RouteAnnouncement = lazy(() => import('./RouteAnnouncement'));

const EASE = [0.16, 1, 0.3, 1] as const;
const EXIT = {
  exit: (covered: boolean) =>
    covered ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0 },
};

/**
 * Shell pages already transition inside AppShell. Keeping one stable key for
 * them avoids wrapping every ordinary navigation in a second animation, while
 * full-screen study and welcome routes get a boundary that can animate out.
 */
export function routeTransitionKey(pathname: string): string {
  if (pathname === '/welcome') return 'welcome';
  if (pathname === '/download') return 'download';
  if (
    pathname === '/learn' ||
    /^\/course\/[^/]+\/(?:study|learn)$/.test(pathname) ||
    /^\/lesson\/[^/]+\/learn$/.test(pathname)
  ) {
    return `focus:${pathname}`;
  }
  return 'shell';
}

export function routeTransitionTiming(multiplier: number) {
  return {
    duration: 0.18 * multiplier,
    ease: EASE,
  };
}

/**
 * Owns transitions between the persistent app shell and full-screen routes.
 * Those boundaries crossfade so the change reads as one app, not a new screen
 * dropping in. Route changes inside the shell remain the responsibility of AppShell.
 */
export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const covered = hasLandingArrival();
  const motionEnabled = multiplier > 0 && !covered;

  return (
    <>
      <Suspense fallback={null}>
        <RouteAnnouncement pathname={location.pathname} />
      </Suspense>
      <AnimatePresence mode="wait" initial={false} custom={covered}>
        <motion.div
          key={routeTransitionKey(location.pathname)}
          className="min-h-screen"
          initial={motionEnabled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          variants={EXIT}
          exit={multiplier > 0 ? 'exit' : undefined}
          transition={routeTransitionTiming(multiplier)}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
