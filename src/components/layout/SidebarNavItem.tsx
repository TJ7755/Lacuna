import type { RefObject } from 'react';
import { m as motion } from 'motion/react';
import { AppNavLink as NavLink } from '../ui/AppLink';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { prefetchRoute } from '../../routes/prefetch';
import { SidebarHoverCard, type SidebarDetail } from './SidebarHoverCard';
import { SidebarLabel, useSidebarMotion } from './SidebarMotion';

/** Display names for the primary entries; stored settings only carry order and visibility. */
export const NAV_LABELS: Record<string, string> = {
  dashboard: 'Today',
  // The page's own name, as the Welcome course, shortcuts and Help call it.
  search: 'Search content',
  analytics: 'Progress',
};

/** Entries that sit at the foot of the sidebar rather than at the top. */
export const FOOTER_NAV = new Set(['share', 'settings', 'help']);

/** Static (non-shared-layout) active state: the white pill, as NavItem draws it. */
const ACTIVE_PILL = 'bg-surface font-semibold text-ink shadow-[0_1px_2px_hsl(var(--ink)/0.06)]';
const PILL_SHADOW = 'shadow-[0_1px_2px_hsl(var(--ink)/0.06)]';
const IDLE_ITEM = 'text-ink-soft hover:bg-ink/5 hover:text-ink';

export function NavItem({
  to,
  icon,
  label,
  collapsed,
  end,
  details,
  compact,
  highlightGroup,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
  details?: SidebarDetail[];
  compact?: boolean;
  highlightGroup?: 'primary' | 'footer';
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { drawer } = useSidebarMotion();
  return (
    <SidebarHoverCard title={label} details={details}>
      <NavLink
        to={to}
        end={end}
        onPointerEnter={() => prefetchRoute(to)}
        onPointerDown={() => prefetchRoute(to)}
        onFocus={() => prefetchRoute(to)}
        title={collapsed ? label : undefined}
        aria-label={label}
        className={({ isActive }) =>
          cn(
            'group relative flex min-h-11 items-center gap-3 rounded-xl transition-colors duration-150',
            compact ? 'px-3 py-2 text-xs' : 'h-11 px-3 text-[15px] short:h-9 short:min-h-9',
            !drawer && 'pl-[14px]',
            isActive ? 'font-semibold text-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId={highlightGroup ? `nav-active-pill-${highlightGroup}` : undefined}
                transition={scaledSpring(m * 1.2, 500, 38)}
                className={cn('absolute inset-0 z-0 rounded-xl bg-surface', PILL_SHADOW)}
              />
            )}
            <span className={cn('relative z-10 shrink-0', !drawer && 'flex w-5 justify-center')}>
              {icon}
            </span>
            <SidebarLabel className={cn('relative z-10', drawer && 'truncate')}>
              {label}
            </SidebarLabel>
          </>
        )}
      </NavLink>
    </SidebarHoverCard>
  );
}

/** A sidebar entry that performs an action rather than routing, styled to sit with the
 *  links around it. Used by the optional AI panel toggle. */
export function ActionNavItem({
  onClick,
  icon,
  label,
  collapsed,
  compact,
  active,
  buttonRef,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  compact?: boolean;
  active?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { drawer } = useSidebarMotion();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-xl text-left transition-colors duration-150',
        compact ? 'px-3 py-2 text-xs' : 'h-11 px-3 text-[15px] short:h-9 short:min-h-9',
        !drawer && 'pl-[14px]',
        active ? ACTIVE_PILL : IDLE_ITEM,
      )}
    >
      <span className={cn('shrink-0', !drawer && 'flex w-5 justify-center')}>{icon}</span>
      <SidebarLabel className={cn('flex-1', drawer && 'truncate')}>{label}</SidebarLabel>
    </button>
  );
}
