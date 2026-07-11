import { useState, useMemo, memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useTheme } from '../../state/ThemeContext';
import { useStudyStats } from '../../state/useData';
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
  FlaskIcon,
  HelpIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SunIcon,
} from '../ui/icons';
import { useCourses, useCourseSummaries, useAllLessons } from '../../state/useCourseData';
import { NewCourseForm } from '../course/NewCourseForm';
import type { Lesson } from '../../db/types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-11 items-center gap-3 rounded-lg transition-all duration-150',
          compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm',
          collapsed ? 'justify-center px-0' : 'hover:translate-x-0.5',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
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

function StudyStreakBadge({ collapsed }: { collapsed: boolean }) {
  const stats = useStudyStats();
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

function LessonItem({
  lesson,
  compact,
}: {
  lesson: Lesson;
  compact: boolean;
}) {
  return (
    <NavLink
      to={`/course/${lesson.courseId}/lesson/${lesson.id}`}
      className={({ isActive }) =>
        cn(
          'flex min-h-10 items-center gap-3 rounded-lg transition-all duration-150',
          compact ? 'py-1.5 pl-9 pr-3 text-xs' : 'py-2 pl-10 pr-3 text-sm',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
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
        <CardsIcon
          width={compact ? 14 : 16}
          height={compact ? 14 : 16}
          className="shrink-0"
        />
      </NavLink>
    );
  }

  // Single-lesson course: plain NavLink, no expander.
  if (!isMultiLesson) {
    return (
      <NavLink
        to={`/course/${courseId}`}
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center gap-3 rounded-lg transition-all duration-150',
            compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            'hover:translate-x-0.5',
            isActive
              ? 'bg-accent-soft text-accent'
              : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
          )
        }
      >
        <CardsIcon
          width={compact ? 14 : 16}
          height={compact ? 14 : 16}
          className="shrink-0"
        />
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
          'group flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-lg transition-all duration-150',
          compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
          'hover:translate-x-0.5',
          isCourseActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        )}
        onClick={() => onToggle(courseId)}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(courseId);
          }
        }}
      >
        <motion.span
          animate={{ rotate: isExpanded ? 0 : -90 }}
          transition={{ duration: 0.15 * m }}
          className="shrink-0 text-ink-faint"
        >
          <ChevronDownIcon width={12} height={12} />
        </motion.span>
        <CardsIcon
          width={compact ? 14 : 16}
          height={compact ? 14 : 16}
          className="shrink-0"
        />
        <span className="flex flex-1 items-center gap-2 min-w-0">
          <span className="truncate">{courseName}</span>
          {eligibleBadge}
        </span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
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

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const courses = useCourses();
  const summaries = useCourseSummaries();
  const allLessons = useAllLessons();
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
        'relative z-20 flex h-screen flex-col border-r border-line bg-surface/80 backdrop-blur-xl transition-[width] duration-200 ease-out',
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
          <FlaskIcon
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
      <nav
        className={cn(
          'flex flex-col gap-1 px-3',
          sidebarSettings.compactMode && 'gap-0',
        )}
      >
        {sidebarSettings.navItems
          .filter((n) => n.visible)
          .map((n) => (
            <NavItem
              key={n.id}
              to={n.id === 'dashboard' ? '/' : `/${n.id}`}
              end={n.id === 'dashboard'}
              icon={
                n.id === 'dashboard' ? <DashboardIcon /> :
                n.id === 'learn' ? <PlayIcon /> :
                n.id === 'search' ? <SearchIcon /> :
                n.id === 'share' ? <ShareIcon /> :
                n.id === 'analytics' ? <ChartIcon /> :
                n.id === 'settings' ? <SettingsIcon /> :
                n.id === 'help' ? <HelpIcon /> :
                <DashboardIcon />
              }
              label={n.label}
              collapsed={collapsed}
              compact={sidebarSettings.compactMode}
              streakBadge={
                n.id === 'learn' ? (
                  <StudyStreakBadge collapsed={collapsed} />
                ) : undefined
              }
            />
          ))}
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
                  eligible={sidebarSettings.showDueCounts ? summaries?.[course.id]?.eligible ?? 0 : 0}
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
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10',
            sidebarSettings.compactMode ? 'min-h-11 min-w-11' : 'min-h-11 min-w-11',
          )}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>

      <AnimatePresence>
        {creatingCourse && (
          <NewCourseForm onClose={() => setCreatingCourse(false)} />
        )}
      </AnimatePresence>
    </aside>
  );
}
