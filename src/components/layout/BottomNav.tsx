// Mobile primary navigation, pinned within thumb reach. The sidebar behind the
// hamburger remains the full navigation; this carries the handful of destinations
// worth reaching in one tap. Deliberately opaque rather than translucent: content
// scrolling under a blurred bar competes with the icons for legibility.
//
// Mounted inside AppShell, so it is absent from Learn mode, which lives outside the
// shell and already pins its own grading controls to the bottom of the screen.

import { NavLink } from 'react-router-dom';
import { CardsIcon, ChartIcon, DashboardIcon, SearchIcon, SettingsIcon } from '../ui/icons';
import { cn } from '../ui/cn';

interface BottomNavItem {
  label: string;
  icon: React.ReactNode;
  to?: string;
  /** Search opens the command palette rather than navigating to a route. */
  action?: 'palette';
  end?: boolean;
}

const ITEMS: BottomNavItem[] = [
  { label: 'Courses', icon: <DashboardIcon width={22} height={22} />, to: '/', end: true },
  { label: 'Study', icon: <CardsIcon width={22} height={22} />, to: '/learn' },
  { label: 'Search', icon: <SearchIcon width={22} height={22} />, action: 'palette' },
  { label: 'Analytics', icon: <ChartIcon width={22} height={22} />, to: '/analytics' },
  { label: 'Settings', icon: <SettingsIcon width={22} height={22} />, to: '/settings' },
];

const ITEM_CLASS =
  'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors';

export function BottomNav({ onOpenPalette }: { onOpenPalette?: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch">
        {ITEMS.map((item) => (
          <li key={item.label} className="flex flex-1">
            {item.action === 'palette' ? (
              <button
                type="button"
                onClick={onOpenPalette}
                className={cn(ITEM_CLASS, 'text-ink-faint active:text-ink')}
              >
                {item.icon}
                {item.label}
              </button>
            ) : (
              <NavLink
                to={item.to ?? '/'}
                end={item.end}
                className={({ isActive }) =>
                  cn(ITEM_CLASS, isActive ? 'text-accent' : 'text-ink-faint active:text-ink')
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
