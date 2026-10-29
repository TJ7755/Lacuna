import { useState, type Ref } from 'react';
import { AnimatePresence, LayoutGroup, LazyMotion, MotionConfig, m as motion } from 'motion/react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { cn } from '../components/ui/cn';
import { MOTION_EASING, scaledSpring } from '../components/ui/motion';
import { SegmentedPills } from '../components/ui/SegmentedPills';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import {
  ArrowRightIcon,
  CardsIcon,
  FileTextIcon,
  LacunaIcon,
  MoonIcon,
  SunIcon,
} from '../components/ui/icons';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { useTheme } from '../state/ThemeContext';
import {
  courseCodes,
  libraryCourses,
  resolveCourseShareUrl,
  type LibraryCourse,
} from './catalogue';
import { ExpandingSheet } from '../components/ui/ExpandingSheet';
import { CourseProvenance } from './CourseProvenance';
import { QualificationGuidance } from '../components/import/QualificationGuidance';

const APP_URL = 'https://getlacuna.app/#/';
const count = new Intl.NumberFormat('en-GB');
const ALL = 'all';

const loadMotion = () => import('../motionFeatures').then((module) => module.default);

export function LibraryPage({ courses = libraryCourses }: { courses?: readonly LibraryCourse[] }) {
  return (
    <LazyMotion features={loadMotion}>
      <MotionConfig reducedMotion="user">
        <Library courses={courses} />
      </MotionConfig>
    </LazyMotion>
  );
}

function Library({ courses }: { courses: readonly LibraryCourse[] }) {
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState(ALL);
  const [open, setOpen] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const boards = [...new Set(courses.map((course) => course.board))];
  const terms = query.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
  const shown = courses.filter((course) => {
    const text = [
      course.subject,
      course.board,
      course.qualification,
      courseCodes(course),
      ...course.topics,
    ]
      .join(' ')
      .toLocaleLowerCase('en-GB');
    return (board === ALL || course.board === board) && terms.every((term) => text.includes(term));
  });
  const openCourse = open && courses.find((course) => course.id === open.id);

  return (
    <div className="min-h-screen pb-16 select-text" inert={open !== null}>
      <a
        href="#library-courses"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to courses
      </a>
      <header className={cn(PAGE_FRAME, 'flex items-center justify-between gap-4 py-5')}>
        <a
          href={APP_URL}
          aria-label="Lacuna home"
          className="flex min-h-11 items-center gap-3 font-brand text-xl font-medium tracking-tight"
        >
          <LacunaIcon aria-hidden="true" className="h-6 w-6 text-accent-ink" />
          Lacuna
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-2">
          <ThemeButton />
          <a href={APP_URL} className={buttonClassName('secondary')}>
            Open Lacuna
          </a>
        </nav>
      </header>

      <main id="library-courses" tabIndex={-1} className={cn(PAGE_FRAME, 'outline-none')}>
        <div className="flex flex-col gap-6 pb-10 pt-8 sm:pt-16">
          <motion.h1
            initial={m > 0 ? { opacity: 0, y: 14 } : false}
            animate={m > 0 ? { opacity: 1, y: 0 } : undefined}
            style={m === 0 ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6 * m, ease: MOTION_EASING.emphasised }}
            className="max-w-3xl font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.035em]"
          >
            Courses, built around your syllabus.
          </motion.h1>
          <motion.div
            initial={m > 0 ? { opacity: 0 } : false}
            animate={m > 0 ? { opacity: 1 } : undefined}
            style={m === 0 ? { opacity: 1 } : undefined}
            transition={{ duration: 0.3 * m, delay: 0.25 * m, ease: MOTION_EASING.emphasised }}
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="max-w-lg text-lg text-ink-soft">
              Lesson notes, recall cards and exam-style practice for each specification.
            </p>
            {boards.length > 1 && (
              <SegmentedPills
                label="Exam board"
                value={board}
                onChange={setBoard}
                options={[
                  { value: ALL, label: 'All' },
                  ...boards.map((value) => ({ value, label: value })),
                ]}
              />
            )}
          </motion.div>
        </div>

        {courses.length > 0 && (
          <div className="mb-6 max-w-2xl">
            <QualificationGuidance />
          </div>
        )}
        {courses.length > 0 && (
          <label className="mb-6 block max-w-lg text-sm text-ink-soft">
            Search courses
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Subject, exam board or syllabus code"
              className="mt-2 block min-h-11 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink"
            />
          </label>
        )}
        {courses.length > 0 && shown.length === 0 && (
          <p role="status" className="py-8 text-ink-soft">
            No courses match your search and exam board.
          </p>
        )}

        {courses.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <StudyDrawing kind="course" className="mb-6 h-24 w-24" />
            <h2 className="mb-2 font-display text-2xl">Courses are on their way</h2>
            <p className="max-w-sm text-ink-soft">There are no courses to browse yet.</p>
          </div>
        ) : (
          <LayoutGroup>
            <motion.section
              aria-label="Courses"
              layout={m > 0}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((course, index) => (
                  <Cover
                    key={course.id}
                    course={course}
                    index={index}
                    expanded={open?.id === course.id}
                    multiplier={m}
                    onOpen={(anchor) => setOpen({ id: course.id, anchor })}
                  />
                ))}
              </AnimatePresence>
            </motion.section>
          </LayoutGroup>
        )}
      </main>

      <AnimatePresence>
        {open && openCourse && (
          <ExpandingSheet
            key={open.id}
            closeLabel="Close course"
            anchor={open.anchor}
            onClose={() => setOpen(null)}
            face={(headingId) => <CoverFace course={openCourse} headingId={headingId} />}
          >
            <CourseDetails course={openCourse} />
          </ExpandingSheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function Cover({
  ref,
  course,
  index,
  expanded,
  multiplier: m,
  onOpen,
}: {
  ref?: Ref<HTMLButtonElement>;
  course: LibraryCourse;
  index: number;
  expanded: boolean;
  multiplier: number;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const lift = { duration: 0.16 * m, ease: MOTION_EASING.emphasised };
  return (
    <motion.button
      ref={ref}
      type="button"
      layout={m > 0}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      // The expansion owns the press: no scale, so the surface grows from the cover's bounds.
      data-press="none"
      onClick={(event) => onOpen(event.currentTarget)}
      initial={m > 0 ? { opacity: 0, y: 12 } : false}
      animate={m > 0 ? { opacity: 1, y: 0 } : undefined}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{
        layout: scaledSpring(m, 380, 36),
        default: { ...scaledSpring(m, 380, 32), delay: (0.3 + index * 0.06) * m },
      }}
      whileHover={m > 0 ? { y: -2, transition: lift } : undefined}
      // The sheet covers the cover exactly, so it hides only while the sheet is open.
      style={{
        visibility: expanded ? 'hidden' : undefined,
        ...(m === 0 ? { opacity: 1, y: 0 } : {}),
      }}
      className="group flex h-full rounded-3xl bg-surface text-left card-surface card-surface-control transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised"
    >
      <CoverFace course={course} />
    </motion.button>
  );
}

/** One face for the cover and the top of its sheet, so opening keeps every line in place. */
function CoverFace({ course, headingId }: { course: LibraryCourse; headingId?: string }) {
  const sheet = headingId !== undefined;
  const Root = sheet ? 'div' : 'span';
  const Title = sheet ? 'h2' : 'span';
  return (
    <Root className="flex h-full w-full flex-col p-6 md:p-7">
      <span className="block pr-12 text-sm text-ink-soft">
        {course.qualification} · {courseCodes(course)}
      </span>
      <Title
        id={headingId}
        tabIndex={sheet ? -1 : undefined}
        className="block pt-10 font-display text-5xl font-semibold leading-none tracking-[-0.035em] text-ink outline-none sm:text-6xl"
      >
        {course.subject}
      </Title>
      <span className="mt-3 block text-ink-soft">{course.summary}</span>
      {course.stats && (
        <span className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1 pt-5">
          <span className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-4 text-sm text-ink-soft tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <CardsIcon width={16} height={16} aria-hidden="true" />
              {count.format(course.stats.cards)} cards
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileTextIcon width={16} height={16} aria-hidden="true" />
              {count.format(course.stats.notes)} lesson notes
            </span>
            {!sheet && (
              <span className="ml-auto font-semibold text-ink transition-colors group-hover:text-accent-ink">
                View course
              </span>
            )}
          </span>
        </span>
      )}
    </Root>
  );
}

function CourseDetails({ course }: { course: LibraryCourse }) {
  const href = resolveCourseShareUrl(course.shareUrl);
  return (
    <div className="flex flex-col gap-6 px-6 pb-7 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {course.stats ? (
          <p className="text-sm text-ink-soft tabular-nums">
            {count.format(course.stats.practiceSets)} practice sets,{' '}
            {count.format(course.stats.practiceMarks)} marks
          </p>
        ) : (
          <span />
        )}
        {href ? (
          <a href={href} className={cn(buttonClassName('primary', 'lg'), 'group/open')}>
            Open in Lacuna
            <ArrowRightIcon className="transition-transform duration-150 group-hover/open:translate-x-0.5" />
          </a>
        ) : (
          <button type="button" disabled className={buttonClassName('secondary', 'lg')}>
            Available soon
          </button>
        )}
      </div>
      <CourseProvenance course={course} />
      <section aria-labelledby={`${course.id}-topics`} className="flex flex-col gap-3">
        <h3 id={`${course.id}-topics`} className="font-display text-lg">
          What you’ll study
        </h3>
        <ol className="flex flex-col gap-2">
          {course.topics.map((topic, index) => (
            <li key={topic} className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong font-display text-sm font-semibold tabular-nums text-ink-soft"
              >
                {index + 1}
              </span>
              <span className="text-[15px] leading-snug">{topic}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
