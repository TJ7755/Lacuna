import { useState, useMemo, memo, type RefObject } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  FlameIcon,
  HelpIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SparklesIcon,
  SunIcon,
} from '../ui/icons';
import { useSidebarData } from '../../state/useCourseData';
import type { Lesson } from '../../db/types';
import { prefetchRoute } from '../../routes/prefetch';
import { formatDate } from '../../utils/datetime';
import { SidebarHoverCard, type SidebarDetail } from './SidebarHoverCard';
import { CourseGlyph, glyphLoad, type GlyphStatus } from '../course/CourseGlyph';
import { forecastStatus } from '../dashboard/ForecastChart';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  toggleLabel?: string;
  collapseControl?: boolean;
  aiAction?: {
    active: boolean;
    onClick: () => void;
    triggerRef: RefObject<HTMLButtonElement | null>;
  };
}

/** Display names for the primary entries; stored settings only carry order and visibility. */
const NAV_LABELS: Record<string, string> = {
  dashboard: 'Today',
  search: 'Search',
  analytics: 'Progress',
};

/** Entries that sit at the foot of the sidebar rather than at the top. */
const FOOTER_NAV = new Set(['share', 'settings', 'help']);

/** The course glyph tracks the window height so rows can give up space as they shrink. */
const GLYPH_SIZE = 'clamp(28px, 4.6dvh, 40px)';

/** Static (non-shared-layout) active state: the white pill, as NavItem draws it. */
const ACTIVE_PILL = 'bg-surface font-semibold text-ink shadow-[0_1px_2px_hsl(var(--ink)/0.06)]';
const PILL_SHADOW = 'shadow-[0_1px_2px_hsl(var(--ink)/0.06)]';
const IDLE_ITEM = 'text-ink-soft hover:bg-ink/5 hover:text-ink';

function NavItem({
  to,
  icon,
  label,
  collapsed,
  end,
  details,
  compact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
  details?: SidebarDetail[];
  compact?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  return (
    <SidebarHoverCard title={label} details={details}>
      <NavLink
        to={to}
        end={end}
        onPointerEnter={() => prefetchRoute(to)}
        onPointerDown={() => prefetchRoute(to)}
        onFocus={() => prefetchRoute(to)}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            'group relative flex min-h-11 items-center gap-3 rounded-xl transition-colors duration-150',
            compact ? 'px-3 py-2 text-xs' : 'h-11 px-3 text-[15px] short:h-9 short:min-h-9',
            collapsed && 'justify-center px-0',
            isActive ? 'font-semibold text-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="nav-active-pill"
                transition={
                  m > 0
                    ? { type: 'spring', stiffness: 500 / m ** 2, damping: 38 / m }
                    : { duration: 0 }
                }
                className={cn('absolute inset-0 z-0 rounded-xl bg-surface', PILL_SHADOW)}
              />
            )}
            <span className="relative z-10 shrink-0">{icon}</span>
            {!collapsed && <span className="relative z-10 truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </SidebarHoverCard>
  );
}

/** A sidebar entry that performs an action rather than routing, styled to sit with the
 *  links around it. Used by the optional AI panel toggle. */
function ActionNavItem({
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
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-xl text-left transition-colors duration-150',
        compact ? 'px-3 py-2 text-xs' : 'h-11 px-3 text-[15px] short:h-9 short:min-h-9',
        collapsed && 'justify-center px-0',
        active ? ACTIVE_PILL : IDLE_ITEM,
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lesson item (inside an expanded course row)
// ---------------------------------------------------------------------------

function LessonItem({ lesson, compact }: { lesson: Lesson; compact: boolean }) {
  return (
    <NavLink
      to={`/course/${lesson.courseId}/lesson/${lesson.id}`}
      onPointerEnter={() => prefetchRoute(`/course/${lesson.courseId}/lesson/${lesson.id}`)}
      onPointerDown={() => prefetchRoute(`/course/${lesson.courseId}/lesson/${lesson.id}`)}
      onFocus={() => prefetchRoute(`/course/${lesson.courseId}/lesson/${lesson.id}`)}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-xl transition-colors duration-150',
          compact ? 'py-1.5 pl-9 pr-3 text-xs' : 'py-2 pl-[3.75rem] pr-3 text-sm',
          isActive ? ACTIVE_PILL : IDLE_ITEM,
        )
      }
    >
      <span
        className={cn(
          'shrink-0 rounded-full bg-current opacity-30',
          compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
        )}
      />
      <span className="truncate">{lesson.name}</span>
    </NavLink>
  );
}

// ---------------------------------------------------------------------------
// Course row — plain link for single-lesson courses; collapsible for multi.
// ---------------------------------------------------------------------------

export interface SidebarGlyph {
  days: number | null;
  recall: number;
  status: GlyphStatus;
  load: number;
}

const CourseRow = memo(function CourseRow({
  courseId,
  courseName,
  glyph,
  lessons,
  details,
  expanded,
  onToggle,
  collapsed,
  compact,
  m,
}: {
  courseId: string;
  courseName: string;
  glyph: SidebarGlyph;
  lessons: Lesson[];
  details?: SidebarDetail[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  collapsed: boolean;
  compact: boolean;
  m: number;
}) {
  const location = useLocation();
  const isMultiLesson = lessons.length > 1;
  const isExpanded = expanded.has(courseId);
  const isCourseActive =
    location.pathname === `/course/${courseId}` ||
    location.pathname.startsWith(`/course/${courseId}/`);

  // Collapsed sidebar: icon-only link to the course page for every course.
  if (collapsed) {
    return (
      <SidebarHoverCard title={courseName} details={details}>
        <NavLink
          to={`/course/${courseId}`}
          onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
          onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
          onFocus={() => prefetchRoute(`/course/${courseId}`)}
          title={courseName}
          className={() =>
            cn(
              'flex min-h-11 items-center justify-center rounded-xl transition-colors duration-150',
              compact ? 'py-1.5' : 'py-2',
              isCourseActive ? ACTIVE_PILL : IDLE_ITEM,
            )
          }
        >
          <CourseGlyph {...glyph} size={compact ? 28 : GLYPH_SIZE} multiplier={m} />
        </NavLink>
      </SidebarHoverCard>
    );
  }

  // Single-lesson course: plain NavLink, no expander.
  if (!isMultiLesson) {
    return (
      <SidebarHoverCard title={courseName} details={details}>
        <NavLink
          to={`/course/${courseId}`}
          onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
          onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
          onFocus={() => prefetchRoute(`/course/${courseId}`)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl transition-colors duration-150',
              compact
                ? 'min-h-11 px-3 py-1.5 text-xs'
                : 'h-full min-h-11 px-3 py-1 text-[15px] short:min-h-10',
              isActive ? ACTIVE_PILL : 'text-ink hover:bg-ink/5',
            )
          }
        >
          <CourseGlyph {...glyph} size={compact ? 28 : GLYPH_SIZE} multiplier={m} />
          <span
            className={cn(
              'min-w-0 flex-1 font-semibold',
              // Two lines fit beside the glyph without growing the row.
              compact ? 'truncate' : 'line-clamp-2 leading-tight [overflow-wrap:anywhere]',
            )}
          >
            {courseName}
          </span>
        </NavLink>
      </SidebarHoverCard>
    );
  }

  // Multi-lesson course: collapsible header with lesson list beneath.
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'group flex w-full items-center gap-1 rounded-xl transition-colors duration-150',
          compact
            ? 'min-h-11 py-1.5 pl-3 pr-1 text-xs'
            : 'min-h-11 flex-1 py-1 pl-3 pr-1 text-[15px] short:min-h-10',
          isCourseActive ? ACTIVE_PILL : 'text-ink hover:bg-ink/5',
        )}
      >
        <SidebarHoverCard title={courseName} details={details}>
          <NavLink
            to={`/course/${courseId}`}
            onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
            onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
            onFocus={() => prefetchRoute(`/course/${courseId}`)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0"
          >
            <CourseGlyph {...glyph} size={compact ? 28 : GLYPH_SIZE} multiplier={m} />
            <span
              className={cn(
                'min-w-0 flex-1 font-semibold',
                // Two lines fit beside the glyph without growing the row.
                compact ? 'truncate' : 'line-clamp-2 leading-tight [overflow-wrap:anywhere]',
              )}
            >
              {courseName}
            </span>
          </NavLink>
        </SidebarHoverCard>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(courseId);
          }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${courseName}` : `Expand ${courseName}`}
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-full text-ink-faint opacity-60 transition hover:bg-ink/10 hover:text-ink hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
            'h-11 w-11',
          )}
        >
          <motion.span
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.15 * m }}
            className="shrink-0"
          >
            <ChevronDownIcon width={12} height={12} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
          >
            {lessons.map((lesson) => (
              <LessonItem key={lesson.id} lesson={lesson} compact={compact} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  toggleLabel,
  collapseControl = true,
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
  const navigate = useNavigate();

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

  // The glyph shares the dashboard's keep-to-schedule forecast, so a course reads
  // the same everywhere; minutes come from today's workload forecast.
  const glyphs = useMemo(() => {
    const now = Date.now();
    const today = data?.stats?.forecast?.[0];
    const map = new Map<string, SidebarGlyph>();
    for (const course of sidebarCourses) {
      const forecast = data?.forecasts?.[course.id];
      const hasExam = course.examDate !== undefined && course.examDate > now;
      map.set(course.id, {
        days: hasExam ? Math.ceil(((course.examDate as number) - now) / 86_400_000) : null,
        recall: forecast?.atEnd ?? summaries?.[course.id]?.mastery ?? 0,
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
    <aside
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
          collapsed ? 'justify-center px-0' : sidebarSettings.compactMode ? 'px-4' : 'px-5',
        )}
      >
        <img
          data-testid="sidebar-brand-mark"
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-[18.75%] bg-[#0a0a0b] p-[3px]',
            sidebarSettings.compactMode ? 'h-8 w-8' : 'h-9 w-9',
          )}
        />
        {!collapsed && (
          <span
            className={cn(
              'font-brand font-medium leading-none tracking-tight',
              sidebarSettings.compactMode ? 'text-lg' : 'text-xl',
            )}
          >
            Lacuna
          </span>
        )}
      </div>

      {/* Primary nav */}
      <nav
        aria-label="Primary navigation"
        className={cn('flex flex-col gap-1 px-3', sidebarSettings.compactMode && 'gap-0')}
      >
        {visibleNav.filter((n) => !FOOTER_NAV.has(n.id)).map(renderNavItem)}
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
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 * m }}
            className="flex items-center justify-between px-3 pb-2"
          >
            <span
              className={cn(
                'text-[13px] font-bold text-ink-faint',
                sidebarSettings.compactMode && 'text-xs',
              )}
            >
              Courses
            </span>
            <button
              type="button"
              onClick={() => {
                if (toggleLabel === 'Close navigation') onToggleCollapsed();
                void navigate('/', { state: { createCourse: true } });
              }}
              title="New course"
              aria-label="New course"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <PlusIcon width={13} height={13} />
            </button>
          </motion.div>
        )}
        <div
          // The scrollbar is hidden, so a shadow marks the edge with more courses beyond it.
          className={cn(
            'scroll-edge-shadows flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            sidebarSettings.compactMode ? 'gap-0' : 'gap-0.5',
          )}
        >
          <AnimatePresence initial={false}>
            {sidebarCourses.map((course, idx) => (
              <motion.div
                key={course.id}
                // Rows start at the board's 56px and give up height (never below 44px)
                // so the whole course list fits the window; an expanded course keeps
                // its natural height.
                className={
                  sidebarSettings.compactMode
                    ? undefined
                    : 'flex min-h-11 shrink basis-14 flex-col short:min-h-10 has-[[aria-expanded=true]]:shrink-0 has-[[aria-expanded=true]]:basis-auto'
                }
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

          {sidebarCourses.length === 0 && !collapsed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 * m }}
              className={cn(
                'px-3 py-2 text-ink-faint',
                sidebarSettings.compactMode ? 'text-xs' : 'text-sm',
              )}
            >
              {courses?.length ? 'No active courses.' : 'No courses yet.'}
            </motion.p>
          )}
          <div className="mt-0.5 [&_a]:text-sm [&_a]:text-ink-faint">
            <NavItem
              to="/archived"
              icon={
                <span
                  className="grid shrink-0 place-items-center"
                  style={{ width: sidebarSettings.compactMode ? 28 : GLYPH_SIZE }}
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
          collapsed && 'flex-col',
        )}
      >
        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle colour theme"
          aria-label="Toggle colour theme"
          className={cn(
            'flex items-center justify-center rounded-xl transition-colors active:bg-ink/10',
            IDLE_ITEM,
            'min-h-11 min-w-11 short:min-h-9 short:min-w-9',
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
              IDLE_ITEM,
              'min-h-11 min-w-11 short:min-h-9 short:min-w-9',
            )}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>
    </aside>
  );
}
