import { useEffect, useState } from 'react';

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

export default function RouteAnnouncement({ pathname }: { pathname: string }) {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const label = routeLabel(pathname);
    document.title = `${label} · Lacuna`;
    setAnnouncement('');
    const timeout = window.setTimeout(() => setAnnouncement(label), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return (
    <div className="sr-only" role="status" aria-atomic="true">
      {announcement}
    </div>
  );
}
