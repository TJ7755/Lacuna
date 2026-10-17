import { memo } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { AppNavLink as NavLink } from '../ui/AppLink';
import { cn } from '../ui/cn';
import { ChevronDownIcon } from '../ui/icons';
import { CourseGlyph, type GlyphStatus } from '../course/CourseGlyph';
import type { Lesson } from '../../db/types';
import { prefetchRoute } from '../../routes/prefetch';
import { SidebarHoverCard, type SidebarDetail } from './SidebarHoverCard';
import { SidebarLabel, useSidebarMotion } from './SidebarMotion';

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
  const isMultiLesson = lessons.length > 1;
  const isExpanded = expanded.has(courseId);
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
          <CourseGlyph {...glyph} size={compact ? 28 : GLYPH_SIZE} multiplier={m} />
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
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'group relative flex w-full items-center gap-1 rounded-xl transition-colors duration-150',
          compact ? 'min-h-11 py-1.5 pl-3 pr-1 text-xs' : 'min-h-11 pl-3 pr-1 text-[15px]',
          !drawer && (compact ? 'pl-[10px]' : 'pl-[9px]'),
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
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0',
              !drawer && 'overflow-hidden',
            )}
          >
            <CourseGlyph {...glyph} size={compact ? 28 : GLYPH_SIZE} multiplier={m} />
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
        <SidebarLabel className={cn('flex shrink-0', !drawer && 'absolute left-48 top-0')}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(courseId);
            }}
            aria-expanded={isExpanded && !collapsed}
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
        </SidebarLabel>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={
              drawer
                ? { opacity: 1 }
                : { height: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }
            }
            inert={collapsed}
            aria-hidden={collapsed || undefined}
            className={drawer ? undefined : 'overflow-hidden'}
            exit={m > 0 ? { opacity: 0 } : undefined}
            transition={
              drawer
                ? { duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }
                : {
                    height: { duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.12 * m },
                  }
            }
          >
            <div className={drawer ? 'contents' : 'w-60'}>
              {lessons.map((lesson) => (
                <LessonItem key={lesson.id} lesson={lesson} compact={compact} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
