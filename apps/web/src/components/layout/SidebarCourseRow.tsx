import { memo, useId } from 'react';
import { useLocation } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { AppNavLink as NavLink } from '../ui/AppLink';
import { cn } from '../ui/cn';
import { ChevronDownIcon } from '../ui/icons';
import { CourseGlyph, type GlyphStatus } from '../course/CourseGlyph';
import type { Lesson } from '../../db/types';
import { prefetchRoute } from '../../routes/prefetch';
import { SidebarHoverCard, type SidebarDetail } from './SidebarHoverCard';
import { SidebarLabel, useSidebarMotion } from './SidebarMotion';
import { AnimatedDisclosure, animatedDisclosureTiming } from '../ui/AnimatedDisclosure';
import { scaledSpring } from '../ui/motion';

/** The course glyph sits comfortably inside a single-line 44px row. */
const GLYPH_SIZE = 30;
const ACTIVE_PILL = 'bg-surface font-semibold text-ink shadow-[0_1px_2px_hsl(var(--ink)/0.06)]';
const IDLE_ITEM = 'text-ink-soft hover:bg-ink/5 hover:text-ink';

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

export const CourseRow = memo(function CourseRow({
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
  const { drawer } = useSidebarMotion();
  const panelId = useId();
  const isMultiLesson = lessons.length > 1;
  const isExpanded = expanded.has(courseId);
  const open = isExpanded && !collapsed;
  const timing = animatedDisclosureTiming(m * (open ? 1 : 0.8));
  const isCourseActive =
    location.pathname === `/course/${courseId}` ||
    location.pathname.startsWith(`/course/${courseId}/`);

  // Single-lesson course: plain NavLink, no expander.
  if (!isMultiLesson) {
    return (
      <SidebarHoverCard title={courseName} details={details}>
        <NavLink
          to={`/course/${courseId}`}
          onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
          onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
          onFocus={() => prefetchRoute(`/course/${courseId}`)}
          aria-label={courseName}
          title={collapsed ? courseName : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl transition-colors duration-150',
              compact
                ? 'min-h-11 px-3 py-1.5 text-xs'
                : 'h-full min-h-11 px-3 py-1 text-[15px] short:min-h-10',
              !drawer && 'overflow-hidden',
              !drawer && (compact ? 'pl-[10px]' : 'pl-[9px]'),
              isActive ? ACTIVE_PILL : 'text-ink hover:bg-ink/5',
            )
          }
        >
          <CourseGlyph
            {...glyph}
            courseId={courseId}
            size={compact ? 28 : GLYPH_SIZE}
            multiplier={m}
          />
          <SidebarLabel
            className={cn(
              'font-semibold',
              drawer ? 'min-w-0 flex-1 truncate' : 'w-[189px] overflow-hidden',
            )}
          >
            {courseName}
          </SidebarLabel>
        </NavLink>
      </SidebarHoverCard>
    );
  }

  // Multi-lesson course: collapsible header with lesson list beneath.
  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'group relative flex min-h-11 w-full rounded-xl transition-colors duration-150',
          compact ? 'text-xs' : 'text-[15px]',
          !drawer && 'overflow-hidden',
          isCourseActive ? ACTIVE_PILL : 'text-ink hover:bg-ink/5',
        )}
      >
        <SidebarHoverCard title={courseName} details={details}>
          <NavLink
            to={`/course/${courseId}`}
            onPointerEnter={() => prefetchRoute(`/course/${courseId}`)}
            onPointerDown={() => prefetchRoute(`/course/${courseId}`)}
            onFocus={() => prefetchRoute(`/course/${courseId}`)}
            aria-label={courseName}
            title={collapsed ? courseName : undefined}
            // The link fills the rounded row, so press feedback traces the row rather than a
            // square box that stops short of the chevron.
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl pl-3',
              compact && 'py-1.5',
              drawer ? 'pr-12' : 'overflow-hidden pr-1',
              !drawer && (compact ? 'pl-[10px]' : 'pl-[9px]'),
            )}
          >
            <CourseGlyph
              {...glyph}
              courseId={courseId}
              size={compact ? 28 : GLYPH_SIZE}
              multiplier={m}
            />
            <SidebarLabel
              className={cn(
                'font-semibold',
                drawer ? 'min-w-0 flex-1 truncate' : 'w-[141px] overflow-hidden',
              )}
            >
              {courseName}
            </SidebarLabel>
          </NavLink>
        </SidebarHoverCard>
        <SidebarLabel
          className={cn(
            'absolute flex shrink-0',
            drawer ? 'inset-y-0 right-1 items-center' : 'left-48 top-0',
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(courseId);
            }}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={isExpanded ? `Collapse ${courseName}` : `Expand ${courseName}`}
            className={cn(
              'relative flex shrink-0 items-center justify-center rounded-full text-ink-faint opacity-60 transition hover:bg-ink/10 hover:text-ink hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
              'h-11 w-11',
            )}
          >
            <motion.span
              initial={false}
              animate={{ rotate: open ? 0 : -90 }}
              transition={scaledSpring(m * 0.75, 420, 2 * Math.sqrt(420))}
              className="shrink-0"
            >
              <ChevronDownIcon width={12} height={12} />
            </motion.span>
          </button>
        </SidebarLabel>
      </div>

      <AnimatedDisclosure
        id={panelId}
        open={open}
        retainContent
        fade={false}
        transition={timing}
        innerClassName={drawer ? undefined : 'w-60'}
      >
        {lessons.map((lesson, index) => {
          const delay =
            Math.min(open ? index * 0.025 : (lessons.length - 1 - index) * 0.015, 0.1) * m;
          return (
            <motion.div
              key={lesson.id}
              initial={false}
              animate={{ opacity: open ? 1 : 0, y: open ? 0 : -4 }}
              transition={{
                opacity: { duration: (open ? 0.16 : 0.1) * m, delay },
                y: { ...scaledSpring(m * (open ? 0.8 : 0.6), 420, 2 * Math.sqrt(420)), delay },
              }}
            >
              <LessonItem lesson={lesson} compact={compact} />
            </motion.div>
          );
        })}
      </AnimatedDisclosure>
    </div>
  );
});
