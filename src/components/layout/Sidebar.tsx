import { useState, useMemo, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useTheme } from '../../state/ThemeContext';
import { useSidebarSettings } from '../../state/sidebarSettings';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import {
  ArchiveIcon,
  CardsIcon,
  ChartIcon,
  CheckIcon,
  CalendarIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  DownloadIcon,
  FlameIcon,
  HelpIcon,
  LacunaIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SparklesIcon,
  SunIcon,
} from '../ui/icons';
import { useSidebarData } from '../../state/useCourseData';
import type { Lesson } from '../../db/types';
import { calendarDaysUntil, formatDate } from '../../utils/datetime';
import { glyphLoad } from '../course/CourseGlyph';
import { NavItem, ActionNavItem, NAV_LABELS, FOOTER_NAV } from './SidebarNavItem';
import { forecastStatus } from '../dashboard/forecastStatus';
import { CourseRow, type SidebarGlyph } from './SidebarCourseRow';
import { SidebarFrame, SidebarLabel } from './SidebarMotion';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  toggleLabel?: string;
  collapseControl?: boolean;
  /** Rendered in the phone drawer, where Today has no room for its Import button. */
  drawer?: boolean;
  aiAction?: {
    active: boolean;
    onClick: () => void;
    triggerRef: RefObject<HTMLButtonElement | null>;
  };
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  toggleLabel,
  collapseControl = true,
  drawer = false,
  aiAction,
}: SidebarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const data = useSidebarData();
  const courses = data?.courses;
  const summaries = data?.summaries;
  const allLessons = data?.lessons;
  const [sidebarSettings] = useSidebarSettings();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  const sidebarCourses = useMemo(
    () => courses?.filter((course) => !course.archived) ?? [],
    [courses],
  );

  // Group lessons by course, preserving per-course orderIndex order.
  const lessonsByCourse = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of allLessons ?? []) {
      const list = map.get(lesson.courseId) ?? [];
      list.push(lesson);
      map.set(lesson.courseId, list);
    }
    // Ensure per-course ordering is correct regardless of the global sort order.
    for (const [, list] of map) {
      list.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return map;
  }, [allLessons]);

  // The glyph shares the dashboard's stop-now forecast, so a course reads
  // the same everywhere; minutes come from today's workload forecast.
  const glyphs = useMemo(() => {
    const now = Date.now();
    const today = data?.stats?.forecast?.[0];
    const map = new Map<string, SidebarGlyph>();
    for (const course of sidebarCourses) {
      const forecast = data?.forecasts?.[course.id];
      const hasExam = course.examDate !== undefined && course.examDate > now;
      map.set(course.id, {
        days: hasExam ? calendarDaysUntil(course.examDate as number, now) : null,
        recall: forecast?.ifStopped ?? summaries?.[course.id]?.mastery ?? 0,
        status: forecast ? forecastStatus(forecast) : hasExam ? 'ahead' : 'steady',
        load: glyphLoad(today?.byDeck.find((slice) => slice.sourceId === course.id)?.minutes ?? 0),
      });
    }
    return map;
  }, [sidebarCourses, summaries, data?.stats, data?.forecasts]);

  const visibleNav = sidebarSettings.navItems.filter((n) => n.visible);
  const renderNavItem = (n: (typeof visibleNav)[number]) => (
    <NavItem
      key={n.id}
      highlightGroup={FOOTER_NAV.has(n.id) ? 'footer' : 'primary'}
      to={n.id === 'dashboard' ? '/' : `/${n.id}`}
      end={n.id === 'dashboard'}
      icon={
        n.id === 'dashboard' ? (
          <ClockIcon />
        ) : n.id === 'search' ? (
          <SearchIcon />
        ) : n.id === 'share' ? (
          <ShareIcon />
        ) : n.id === 'analytics' ? (
          <ChartIcon />
        ) : n.id === 'settings' ? (
          <SettingsIcon />
        ) : n.id === 'help' ? (
          <HelpIcon />
        ) : (
          <DashboardIcon />
        )
      }
      label={NAV_LABELS[n.id] ?? n.label}
      collapsed={collapsed}
      compact={sidebarSettings.compactMode}
      details={
        n.id === 'dashboard' && data?.stats
          ? [
              {
                icon: <FlameIcon width={14} height={14} />,
                label: 'Day streak',
                value: data.stats.streak,
              },
              {
                icon: <CheckIcon width={14} height={14} />,
                label: 'Reviewed today',
                value: data.stats.reviewedToday,
              },
            ]
          : undefined
      }
    />
  );

  function toggleCourse(id: string) {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <SidebarFrame
      collapsed={collapsed}
      drawer={drawer}
      multiplier={m}
      className={cn(
        'relative z-20 flex h-full flex-col bg-chrome',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        // Grow the box by the left inset. Under border-box the padding would
        // otherwise come out of the chrome (72px / 264px), which clips the
        // collapsed rail on a landscape phone with the island on the left.
        collapsed
          ? 'w-[calc(72px+env(safe-area-inset-left))]'
          : 'w-[calc(264px+env(safe-area-inset-left))]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-3',
          sidebarSettings.compactMode ? 'py-3' : 'py-[clamp(0.75rem,2.4dvh,1.25rem)]',
          drawer
            ? sidebarSettings.compactMode
              ? 'px-4'
              : 'px-5'
            : sidebarSettings.compactMode
              ? 'px-5'
              : 'px-[18px]',
        )}
      >
        <LacunaIcon
          data-testid="sidebar-brand-mark"
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-[18.75%] bg-accent-soft p-[3px] text-accent-ink',
            sidebarSettings.compactMode ? 'h-8 w-8' : 'h-9 w-9',
          )}
        />
        <SidebarLabel
          className={cn(
            'font-brand font-medium leading-none tracking-tight',
            sidebarSettings.compactMode ? 'text-lg' : 'text-xl',
          )}
        >
          Lacuna
        </SidebarLabel>
      </div>

      {/* Primary nav */}
      <nav
        aria-label="Primary navigation"
        className={cn('flex flex-col gap-1 px-3', sidebarSettings.compactMode && 'gap-0')}
      >
        {visibleNav.filter((n) => !FOOTER_NAV.has(n.id)).map(renderNavItem)}
        {drawer && (
          <NavItem
            to="/import"
            icon={<DownloadIcon />}
            label="Import"
            collapsed={collapsed}
            compact={sidebarSettings.compactMode}
          />
        )}
        {aiAction && (
          <div>
            <ActionNavItem
              onClick={aiAction.onClick}
              icon={<SparklesIcon />}
              label="AI"
              collapsed={collapsed}
              compact={sidebarSettings.compactMode}
              active={aiAction.active}
              buttonRef={aiAction.triggerRef}
            />
          </div>
        )}
      </nav>

      {/* Course list */}
      <nav
        aria-label="Courses"
        className={cn(
          'flex min-h-0 flex-1 flex-col px-3',
          sidebarSettings.compactMode ? 'mt-3' : 'mt-[clamp(0.5rem,2.4dvh,1.5rem)]',
        )}
      >
        <SidebarLabel className="flex h-11 shrink-0 items-center px-3 pb-2 font-display text-sm text-ink-soft">
          Courses
        </SidebarLabel>
        <div
          // The scrollbar is hidden, so a fade marks the edge with more courses beyond it.
          className={cn(
            'scroll-edge-fade flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            sidebarSettings.compactMode ? 'gap-0' : 'gap-0.5',
          )}
        >
          <AnimatePresence initial={false}>
            {sidebarCourses.map((course, idx) => (
              <motion.div
                key={course.id}
                // Single-line rows at the 44px target; the list scrolls beyond that.
                className={sidebarSettings.compactMode ? undefined : 'flex shrink-0 flex-col'}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{
                  duration: 0.18 * m,
                  delay: Math.min(idx * 0.02, 0.15) * m,
                  ease: [0.16, 1, 0.3, 1],
                }}
                layout="position"
              >
                <CourseRow
                  courseId={course.id}
                  courseName={course.name}
                  glyph={
                    glyphs.get(course.id) ?? { days: null, recall: 0, status: 'steady', load: 0 }
                  }
                  lessons={lessonsByCourse.get(course.id) ?? []}
                  details={
                    sidebarSettings.showDueCounts && summaries?.[course.id]
                      ? [
                          {
                            icon: <CardsIcon width={14} height={14} />,
                            label: 'Ready to study',
                            value: summaries[course.id].eligible,
                          },
                          {
                            icon: <SparklesIcon width={14} height={14} />,
                            label: 'New cards',
                            value: summaries[course.id].unreviewed,
                          },
                          ...(course.examDate
                            ? [
                                {
                                  icon: <CalendarIcon width={14} height={14} />,
                                  label: 'Exam',
                                  value: formatDate(course.examDate, course.timeZone),
                                },
                              ]
                            : []),
                        ]
                      : undefined
                  }
                  expanded={expandedCourses}
                  onToggle={toggleCourse}
                  collapsed={collapsed}
                  compact={sidebarSettings.compactMode}
                  m={m}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {courses !== undefined && sidebarCourses.length === 0 && (
            <SidebarLabel
              className={cn(
                'px-3 py-2 text-ink-faint',
                sidebarSettings.compactMode ? 'text-xs' : 'text-sm',
              )}
            >
              {courses?.length ? 'No active courses.' : 'No courses yet.'}
            </SidebarLabel>
          )}
          <div className="mt-0.5 [&_a]:text-sm [&_a]:text-ink-faint">
            <NavItem
              to="/archived"
              icon={
                <span
                  className="grid shrink-0 place-items-center"
                  style={{ width: drawer ? (sidebarSettings.compactMode ? 28 : 30) : 20 }}
                >
                  <ArchiveIcon />
                </span>
              }
              label="Archived"
              collapsed={collapsed}
              compact={sidebarSettings.compactMode}
            />
          </div>
        </div>
      </nav>

      {/* Footer: Share, Settings and Help, then the theme toggle and collapse button */}
      <nav
        aria-label="More"
        className={cn('flex flex-col gap-0.5 px-3 pt-2', sidebarSettings.compactMode && 'gap-0')}
      >
        {visibleNav.filter((n) => FOOTER_NAV.has(n.id)).map(renderNavItem)}
      </nav>
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3',
          sidebarSettings.compactMode ? 'py-2' : 'py-3 short:py-1',
          !drawer && 'flex-col items-start pl-[14px]',
        )}
      >
        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle colour theme"
          aria-label="Toggle colour theme"
          className={cn(
            'flex items-center justify-center rounded-xl transition-colors active:bg-ink/10',
            'text-ink-soft hover:bg-ink/5 hover:text-ink',
            drawer
              ? 'min-h-11 min-w-11 short:min-h-9 short:min-w-9'
              : 'h-11 w-11 shrink-0 short:h-9 short:min-h-9',
          )}
        >
          {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {collapseControl && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            aria-label={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            className={cn(
              'flex items-center justify-center rounded-xl transition-colors active:bg-ink/10',
              'text-ink-soft hover:bg-ink/5 hover:text-ink',
              drawer
                ? 'min-h-11 min-w-11 short:min-h-9 short:min-w-9'
                : 'h-11 w-11 shrink-0 short:h-9 short:min-h-9',
            )}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>
    </SidebarFrame>
  );
}
