import { useState, useMemo, memo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useTheme } from '../../state/ThemeContext';
import { useSidebarSettings } from '../../state/sidebarSettings';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import {
  CardsIcon,
  ChartIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  FlameIcon,
  LacunaIcon,
  HelpIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SunIcon,
} from '../ui/icons';
import { useSidebarData } from '../../state/useCourseData';
import { NewCourseForm } from '../course/NewCourseForm';
import type { Lesson } from '../../db/types';
import type { StudyStats } from '../../fsrs/stats';
import { prefetchRoute } from '../../routes/prefetch';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  toggleLabel?: string;
  /** Opens the command palette instead of routing to /search. When omitted
   *  (surfaces without palette wiring, e.g. LearnMode's nav drawer) the
   *  search item falls back to a plain link to the full search page. */
  onOpenPalette?: () => void;
  /** Raises the study sheet instead of routing to /learn. Omitted on surfaces without
   *  sheet wiring, where Review today falls back to the full-screen session. */
  onOpenStudySheet?: () => void;
  collapseControl?: boolean;
}

function NavItem({
  to,
  icon,
  label,
  collapsed,
  end,
  streakBadge,
  compact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
  streakBadge?: React.ReactNode;
  compact?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  return (
    <NavLink
      to={to}
      end={end}
      onPointerEnter={() => prefetchRoute(to)}
      onPointerDown={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-11 items-center gap-3 rounded-lg transition-all duration-150',
          compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm',
          collapsed ? 'justify-center px-0' : 'hover:translate-x-0.5',
          isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              transition={{ duration: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent"
            />
          )}
          <span className="shrink-0">{icon}</span>
          {!collapsed && <span className="truncate">{label}</span>}
          {!collapsed && streakBadge}
        </>
      )}
    </NavLink>
  );
}

/** A sidebar entry that performs an action rather than routing, styled to sit with the
 *  links around it. Used by Review today, which raises the study sheet. */
function ActionNavItem({
  onClick,
  icon,
  label,
  collapsed,
  compact,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-all duration-150',
        compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm',
        collapsed ? 'justify-center px-0' : 'hover:translate-x-0.5',
        'text-ink-soft hover:bg-ink/5 hover:text-ink',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </button>
  );
}

/** The sidebar's search entry: opens the command palette rather than routing to a
 *  page, with a visible ⌘K/Ctrl+K hint so the palette is discoverable without
 *  reading the shortcuts cheatsheet first. */
function SearchNavItem({
  onOpenPalette,
  collapsed,
  compact,
}: {
  onOpenPalette: () => void;
  collapsed: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpenPalette}
      title={collapsed ? 'Search (Ctrl/Cmd+K)' : undefined}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-all duration-150',
        compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm',
        collapsed ? 'justify-center px-0' : 'hover:translate-x-0.5',
        'text-ink-soft hover:bg-ink/5 hover:text-ink',
      )}
    >
      <span className="shrink-0">
        <SearchIcon />
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">Search</span>
          <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
            Ctrl/Cmd+K
          </kbd>
        </>
      )}
    </button>
  );
}

function StudyStreakBadge({ collapsed, stats }: { collapsed: boolean; stats?: StudyStats }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const streak = stats?.streak ?? 0;
  if (streak === 0) {
    return null;
  }
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.3 * m }}
      className={cn(
        'group/streak ml-auto flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium tabular text-accent',
        collapsed && 'hidden',
      )}
      title={`${streak} day streak`}
    >
      <FlameIcon width={12} height={12} />
      {streak}
      {/* Hover: the bubble grows a word, expanding pill-to-squircle in place. */}
      <span className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width] duration-300 ease-out group-hover/streak:max-w-20">
        day streak
      </span>
    </motion.span>
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
          'flex min-h-10 items-center gap-3 rounded-lg transition-all duration-150',
          compact ? 'py-1.5 pl-9 pr-3 text-xs' : 'py-2 pl-10 pr-3 text-sm',
          isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
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

const CourseRow = memo(function CourseRow({
  courseId,
  courseName,
  lessons,
  eligible,
  expanded,
  onToggle,
  collapsed,
  compact,
  m,
}: {
  courseId: string;
  courseName: string;
  lessons: Lesson[];
  eligible: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  collapsed: boolean;
  compact: boolean;
  m: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMultiLesson = lessons.length > 1;
  const isExpanded = expanded.has(courseId);
  const isCourseActive =
    location.pathname === `/course/${courseId}` ||
    location.pathname.startsWith(`/course/${courseId}/`);

  const eligibleBadge =
    eligible > 0 ? (
      <span
        className={cn(
          'ml-auto shrink-0 rounded-full bg-accent/10 px-1.5 py-0 text-[10px] font-medium tabular text-accent',
          compact && 'text-[9px]',
        )}
      >
        {eligible}
      </span>
    ) : null;

  // Collapsed sidebar: icon-only link to the course page for every course.
  if (collapsed) {
    return (
      <NavLink
        to={`/course/${courseId}`}
        onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
        onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
        onFocus={() => prefetchRoute(`/course/${courseId}`)}
        title={courseName}
        className={() =>
          cn(
            'flex min-h-11 items-center justify-center rounded-lg transition-all duration-150',
            compact ? 'py-1.5' : 'py-2',
            isCourseActive
              ? 'bg-accent-soft text-accent'
              : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
          )
        }
      >
        <CardsIcon width={compact ? 14 : 16} height={compact ? 14 : 16} className="shrink-0" />
      </NavLink>
    );
  }

  // Single-lesson course: plain NavLink, no expander.
  if (!isMultiLesson) {
    return (
      <NavLink
        to={`/course/${courseId}`}
        onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
        onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
        onFocus={() => prefetchRoute(`/course/${courseId}`)}
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center gap-3 rounded-lg transition-all duration-150',
            compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            'hover:translate-x-0.5',
            isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
          )
        }
      >
        <CardsIcon width={compact ? 14 : 16} height={compact ? 14 : 16} className="shrink-0" />
        <span className="flex flex-1 items-center gap-2 min-w-0">
          <span className="truncate">{courseName}</span>
          {eligibleBadge}
        </span>
      </NavLink>
    );
  }

  // Multi-lesson course: collapsible header with lesson list beneath.
  return (
    <div>
      <div
        className={cn(
          'group flex w-full min-h-11 items-center gap-1 rounded-lg transition-all duration-150',
          compact ? 'pr-3 py-1.5 text-xs' : 'pr-3 py-2 text-sm',
          'hover:translate-x-0.5',
          isCourseActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(courseId);
          }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${courseName}` : `Expand ${courseName}`}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-ink/10 hover:text-ink',
            compact ? 'ml-1.5 h-6 w-6' : 'ml-2 h-7 w-7',
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
        <div
          role="link"
          tabIndex={0}
          onClick={() => navigate(`/course/${courseId}`)}
          onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
          onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
          onFocus={() => prefetchRoute(`/course/${courseId}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              navigate(`/course/${courseId}`);
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0"
        >
          <CardsIcon width={compact ? 14 : 16} height={compact ? 14 : 16} className="shrink-0" />
          <span className="flex flex-1 items-center gap-2 min-w-0">
            <span className="truncate">{courseName}</span>
            {eligibleBadge}
          </span>
        </div>
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
  onOpenPalette,
  onOpenStudySheet,
  collapseControl = true,
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
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Courses shown in the sidebar list; archived courses are included only when the
  // "Show archived courses" setting is on.
  const sidebarCourses = useMemo(
    () => courses?.filter((c) => sidebarSettings.showArchived || !c.archived) ?? [],
    [courses, sidebarSettings.showArchived],
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
        'relative z-20 flex h-screen flex-col border-r border-line bg-surface',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-3',
          sidebarSettings.compactMode ? 'px-4 py-3' : 'px-5 py-5',
          collapsed && 'justify-center px-0',
        )}
      >
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-xl bg-accent text-accent-fg',
            sidebarSettings.compactMode ? 'h-8 w-8' : 'h-9 w-9',
          )}
        >
          <LacunaIcon
            width={sidebarSettings.compactMode ? 18 : 20}
            height={sidebarSettings.compactMode ? 18 : 20}
          />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <div
              className={cn(
                'font-display tracking-tight',
                sidebarSettings.compactMode ? 'text-lg' : 'text-xl',
              )}
            >
              Lacuna
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Spaced revision
            </div>
          </div>
        )}
      </div>

      {/* Primary nav */}
      <nav className={cn('flex flex-col gap-1 px-3', sidebarSettings.compactMode && 'gap-0')}>
        {sidebarSettings.navItems
          .filter((n) => n.visible)
          .map((n) =>
            n.id === 'search' && onOpenPalette ? (
              <SearchNavItem
                key={n.id}
                onOpenPalette={onOpenPalette}
                collapsed={collapsed}
                compact={sidebarSettings.compactMode}
              />
            ) : n.id === 'today' && onOpenStudySheet ? (
              <ActionNavItem
                key={n.id}
                onClick={onOpenStudySheet}
                icon={<CardsIcon />}
                label={n.label}
                collapsed={collapsed}
                compact={sidebarSettings.compactMode}
              />
            ) : (
              <NavItem
                key={n.id}
                to={n.id === 'dashboard' ? '/' : n.id === 'today' ? '/learn' : `/${n.id}`}
                end={n.id === 'dashboard'}
                icon={
                  n.id === 'dashboard' ? (
                    <DashboardIcon />
                  ) : n.id === 'today' ? (
                    <CardsIcon />
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
                label={n.label}
                collapsed={collapsed}
                compact={sidebarSettings.compactMode}
                streakBadge={
                  n.id === 'dashboard' ? (
                    <StudyStreakBadge collapsed={collapsed} stats={data?.stats} />
                  ) : undefined
                }
              />
            ),
          )}
      </nav>

      {/* Course list */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col px-3',
          sidebarSettings.compactMode ? 'mt-3' : 'mt-6',
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
                'uppercase tracking-[0.16em] text-ink-faint',
                sidebarSettings.compactMode ? 'text-[10px]' : 'text-[11px]',
              )}
            >
              Courses
            </span>
            <button
              type="button"
              onClick={() => setCreatingCourse(true)}
              title="New course"
              aria-label="New course"
              className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <PlusIcon width={13} height={13} />
            </button>
          </motion.div>
        )}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto pb-2',
            sidebarSettings.compactMode ? 'gap-0' : 'gap-0.5',
          )}
        >
          <AnimatePresence initial={false}>
            {sidebarCourses.map((course, idx) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{
                  duration: 0.18 * m,
                  delay: Math.min(idx * 0.02, 0.15) * m,
                  ease: [0.16, 1, 0.3, 1],
                }}
                layout
              >
                <CourseRow
                  courseId={course.id}
                  courseName={course.name}
                  lessons={lessonsByCourse.get(course.id) ?? []}
                  eligible={
                    sidebarSettings.showDueCounts ? (summaries?.[course.id]?.eligible ?? 0) : 0
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
              No courses yet.
            </motion.p>
          )}
        </div>
      </div>

      {/* Footer: theme toggle + collapse button */}
      <div
        className={cn(
          'flex items-center gap-2 border-t border-line px-3',
          sidebarSettings.compactMode ? 'py-2' : 'py-3',
          collapsed && 'flex-col',
        )}
      >
        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle colour theme"
          aria-label="Toggle colour theme"
          className={cn(
            'flex items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10',
            sidebarSettings.compactMode ? 'min-h-11 min-w-11' : 'min-h-11 min-w-11',
          )}
        >
          {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {!collapsed && (
          <span className="flex-1 text-xs text-ink-faint">
            {resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}
          </span>
        )}
        {collapseControl && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            aria-label={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            className={cn(
              'flex items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10',
              sidebarSettings.compactMode ? 'min-h-11 min-w-11' : 'min-h-11 min-w-11',
            )}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>

      <AnimatePresence>
        {creatingCourse && <NewCourseForm onClose={() => setCreatingCourse(false)} />}
      </AnimatePresence>
    </aside>
  );
}
