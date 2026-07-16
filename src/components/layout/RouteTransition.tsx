import { AnimatePresence, m as motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Shell pages already transition inside AppShell. Keeping one stable key for
 * them avoids wrapping every ordinary navigation in a second animation, while
 * full-screen study and welcome routes get a boundary that can animate out.
 */
export function routeTransitionKey(pathname: string): string {
  if (pathname === '/welcome') return 'welcome';
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
 * Route changes inside the shell remain the responsibility of AppShell.
 */
export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const motionEnabled = multiplier > 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeTransitionKey(location.pathname)}
        className="min-h-screen"
        initial={motionEnabled ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={motionEnabled ? { opacity: 0, y: -6 } : undefined}
        transition={routeTransitionTiming(multiplier)}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
