import type { ReactNode } from 'react';
import { cn } from '../components/ui/cn';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoIcon,
  LacunaIcon,
  MoonIcon,
  PlusIcon,
  ShareIcon,
  SunIcon,
  UploadIcon,
} from '../components/ui/icons';
import { useTheme } from '../state/ThemeContext';
import type { ConnectedGapsCourse } from './connectionStore';
import { ClassGlyph, useSlidingIndicator } from './gapsUi';

export type GapsPage =
  { kind: 'today' } | { kind: 'class'; shareId: string } | { kind: 'recover' } | { kind: 'about' };
export interface SidebarClass {
  course: ConnectedGapsCourse;
  locked: boolean;
  count?: number;
  score?: number | null;
}

const ROW =
  'relative z-10 flex w-full items-center gap-3 rounded-xl text-left text-[15px] transition-colors duration-150';
const IDLE = 'text-ink-soft hover:bg-ink/5 hover:text-ink';

/** Lacuna's sidebar, with classes in place of courses. */
export function GapsSidebar({
  page,
  classes,
  collapsed,
  drawer = false,
  onToday,
  onClass,
  onConnect,
  onRecover,
  onAbout,
  onToggleCollapsed,
}: {
  page: GapsPage;
  classes: SidebarClass[] | null;
  collapsed: boolean;
  drawer?: boolean;
  onToday(): void;
  onClass(course: ConnectedGapsCourse): void;
  onConnect(): void;
  onRecover(): void;
  onAbout(): void;
  onToggleCollapsed(): void;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const activeKey = page.kind === 'class' ? page.shareId : page.kind;
  const { container, indicatorProps } = useSlidingIndicator(`${activeKey}:${classes?.length ?? 0}`);
  const hint = (label: string) => (collapsed ? label : undefined);

  return (
    <aside
      aria-label="Gaps"
      data-collapsed={collapsed || undefined}
      className={cn(
        'gaps-sidebar relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-chrome',
        drawer && 'w-[280px]!',
      )}
    >
      <div className="flex w-[264px] items-center gap-3 px-[18px] py-[clamp(0.75rem,2.4dvh,1.25rem)]">
        <LacunaIcon
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-[18.75%] bg-accent-ink p-[3px] text-accent dark:bg-accent-soft dark:text-accent-ink"
        />
        <span className="gaps-sidebar-label font-brand text-xl font-medium leading-none tracking-tight">
          Gaps
        </span>
      </div>

      <nav
        ref={container}
        aria-label="Classes"
        className="relative flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3 pb-2 [scrollbar-width:none]"
      >
        <span
          aria-hidden="true"
          {...indicatorProps}
          className="gaps-indicator absolute left-0 top-0 rounded-xl bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.06)]"
        />
        <button
          type="button"
          onClick={onToday}
          aria-current={activeKey === 'today' ? 'page' : undefined}
          data-indicator-target={activeKey === 'today'}
          title={hint('Today')}
          className={cn(
            ROW,
            'h-11 px-3 pl-[14px]',
            activeKey === 'today' ? 'font-semibold text-ink' : IDLE,
          )}
        >
          <span className="flex w-5 shrink-0 justify-center">
            <ClockIcon />
          </span>
          <span className="gaps-sidebar-label overflow-hidden whitespace-nowrap">Today</span>
        </button>

        <span className="gaps-sidebar-label overflow-hidden whitespace-nowrap mt-[clamp(0.5rem,2.4dvh,1.5rem)] flex h-11 shrink-0 items-center px-3 pb-2 font-display text-sm text-ink-soft">
          Classes
        </span>
        {classes?.map(({ course, locked, count, score }) => {
          const active = activeKey === course.shareId;
          return (
            <button
              key={course.shareId}
              type="button"
              onClick={() => onClass(course)}
              aria-current={active ? 'page' : undefined}
              data-indicator-target={active}
              title={hint(course.courseName)}
              className={cn(
                ROW,
                'min-h-11 px-3 py-1 pl-[9px]',
                active ? 'font-semibold text-ink' : 'text-ink hover:bg-ink/5',
              )}
            >
              <ClassGlyph locked={locked} count={count} score={score} />
              <span className="gaps-sidebar-label min-w-0 flex-1 truncate">
                {course.courseName}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onConnect}
          title={hint('Connect a class')}
          className={cn(
            ROW,
            'h-11 px-3 pl-[14px] text-sm text-ink-faint hover:bg-ink/5 hover:text-ink',
          )}
        >
          <span className="flex w-5 shrink-0 justify-center">
            <PlusIcon />
          </span>
          <span className="gaps-sidebar-label overflow-hidden whitespace-nowrap">
            Connect a class
          </span>
        </button>
      </nav>

      <nav aria-label="More" className="flex w-full flex-col gap-0.5 px-3 pt-2">
        <FooterItem
          icon={<UploadIcon />}
          label="Recover a class"
          active={page.kind === 'recover'}
          hint={hint}
          onClick={onRecover}
        />
        <FooterItem
          icon={<InfoIcon />}
          label="About Gaps"
          active={page.kind === 'about'}
          hint={hint}
          onClick={onAbout}
        />
        <a
          href="https://getlacuna.app/#/"
          title={hint('Open Lacuna')}
          className={cn(ROW, 'h-11 px-3 pl-[14px]', IDLE)}
        >
          <span className="flex w-5 shrink-0 justify-center">
            <ShareIcon />
          </span>
          <span className="gaps-sidebar-label overflow-hidden whitespace-nowrap">Open Lacuna</span>
        </a>
      </nav>

      <div
        className={cn(
          'flex w-[264px] px-3 py-3',
          drawer ? 'justify-start' : 'flex-col items-start pl-[14px]',
        )}
      >
        <div className={cn(!drawer && 'gaps-sidebar-theme pb-2')}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle colour theme"
            title="Toggle colour theme"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
          >
            {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        {!drawer && (
          <div className="gaps-sidebar-collapse">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function FooterItem({
  icon,
  label,
  active,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  hint(label: string): string | undefined;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={hint(label)}
      className={cn(
        ROW,
        'h-11 px-3 pl-[14px]',
        active ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_hsl(var(--ink)/0.06)]' : IDLE,
      )}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span className="gaps-sidebar-label overflow-hidden whitespace-nowrap">{label}</span>
    </button>
  );
}
