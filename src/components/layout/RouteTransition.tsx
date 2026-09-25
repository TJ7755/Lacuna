import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { hasLandingArrival } from './LandingTransition';

const EASE = [0.16, 1, 0.3, 1] as const;
const EXIT = {
  exit: (covered: boolean) => covered
    ? { opacity: 1, transition: { duration: 0 } }
    : { opacity: 0 },
};

function routeLabel(pathname: string): string {
  const pages: Record<string, string> = {
    '/': 'Courses',
    '/settings': 'Settings',
    '/search': 'Search',
    '/share': 'Share',
    '/analytics': 'Analytics',
    '/archived': 'Archived courses',
    '/help': 'Help',
    '/welcome': 'Welcome',
    '/landing': 'Welcome',
    '/download': 'Download',
    '/method': 'The method',
    '/learn': 'Practice',
  };
  if (pages[pathname]) return pages[pathname];

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'lesson' && segments[2] === 'learn') return 'Learn lesson';
  if (segments[0] !== 'course') return 'Page not found';

  const section = segments[2];
  if (!section) return 'Course path';
  if (section === 'study') return 'Study course';
  if (section === 'learn') return 'Practise course';
  if (section === 'lesson') return segments.includes('cards') ? 'Edit card' : 'Lesson';
  if (section === 'cards') return segments.length > 3 ? 'Edit card' : 'Cards';
  if (section === 'questions') {
    if (segments[3] === 'learn') return 'Practise questions';
    return segments.length > 3 ? 'Edit question' : 'Questions';
  }
  const coursePages: Record<string, string> = {
    settings: 'Course settings',
    analytics: 'Course analytics',
    updates: 'Course updates',
    sequence: 'Edit sequence',
    occlusion: 'Edit occlusion',
  };
  return coursePages[section] ?? 'Page not found';
}

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
  const [announcement, setAnnouncement] = useState('');
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const covered = hasLandingArrival();
  const motionEnabled = multiplier > 0 && !covered;

  useEffect(() => {
    const label = routeLabel(location.pathname);
    document.title = `${label} · Lacuna`;
    setAnnouncement('');
    const timeout = window.setTimeout(() => setAnnouncement(label), 0);
    return () => window.clearTimeout(timeout);
  }, [location.pathname]);

  return (
    <>
      <div className="sr-only" role="status" aria-atomic="true">{announcement}</div>
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
