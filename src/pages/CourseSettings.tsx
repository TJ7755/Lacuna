import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourse, useCourseCards, useCourseReviewHistory } from '../state/useCourseData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { CourseTabs } from '../components/course/CourseTabs';
import { Toggle } from '../components/ui/Toggle';
import { useToast } from '../components/ui/Toast';
import { SectionRail, SectionRailMobileJumper, useSectionRail } from '../components/ui/SectionRail';
import { deleteCourse, snapshotCourse, restoreCourse, updateCourse } from '../db/repository';
import type { CourseSnapshot } from '../db/repository';
import {
  clampRequestRetention,
  defaultFsrsParameters,
  DEFAULT_REQUEST_RETENTION,
} from '../fsrs/params';
import { ChevronLeftIcon } from '../components/ui/icons';
import type { CourseRecord, ExamObjective, FsrsParameters, UnlockMode } from '../db/types';
import type { LessonViewMode } from '../state/lessonViewMode';
import { parseSteps } from './settings/parseSteps';
import { SchedulingFieldsSection } from './settings/SchedulingFieldsSection';
import { OptimisationPanel } from './settings/OptimisationPanel';
import { UnlockModeSection } from './settings/UnlockModeSection';
import { PracticeSettingsSection } from './settings/PracticeSettingsSection';
import { LessonViewModeSection } from './settings/LessonViewModeSection';
import { ExamDatesSection } from './settings/ExamDatesSection';
import { LessonManagementSection } from './settings/LessonManagementSection';
import { PracticeNodesSection } from './settings/PracticeNodesSection';
import { DangerZoneSection } from './settings/DangerZoneSection';
import { DetachCourseSection } from './settings/DetachCourseSection';

const COURSE_SETTINGS_SECTIONS = [
  { id: 'course-settings-basics', label: 'Basics' },
  { id: 'course-settings-study', label: 'Study' },
  { id: 'course-settings-content', label: 'Content' },
  { id: 'course-settings-assessments', label: 'Assessments' },
  { id: 'course-settings-danger', label: 'Danger zone' },
];

/**
 * Full-page course settings, mirroring DeckSettings but for the Course/Lesson model:
 * scheduling fields, optimisation, unlock mode, auto-practice, exam dates and lesson
 * management, plus a danger zone. Grouped under a shared scrollspy rail (Basics,
 * Study, Content, Assessments, Danger zone — see SectionRail) with one save model:
 * every field commits instantly through `updateCourse` (text/numeric inputs on blur,
 * toggles/selects on change) rather than being staged behind a "Save changes" button,
 * matching the pattern ExamDates/LessonManagement/PracticeNodes already used. Course
 * deletion uses the same snapshot + undo-toast pattern as deck deletion (see
 * DangerZoneSection), rather than a blocking confirmation.
 */
export function CourseSettings() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { activeSection, goToSection } = useSectionRail(COURSE_SETTINGS_SECTIONS);

  // Use a null-sentinel to distinguish "loading" (undefined) from "not found"
  // (null), matching CoursePath's pattern — Dexie's .get() resolves to
  // undefined for a missing row, so useCourse alone cannot signal not-found.
  const course = useCourse(courseId);
  const cards = useCourseCards(courseId);
  const reviewHistory = useCourseReviewHistory(courseId);

  const [name, setName] = useState('');
  const [examBoard, setExamBoard] = useState('');
  const [specification, setSpecification] = useState('');
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [objective, setObjective] = useState<ExamObjective>('expectedMarks');
  const [newPerDay, setNewPerDay] = useState('');
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState('');
  const [retention, setRetention] = useState(DEFAULT_REQUEST_RETENTION);
  const [enableFuzz, setEnableFuzz] = useState(true);
  const [maxInterval, setMaxInterval] = useState('');
  const [learningSteps, setLearningSteps] = useState('');
  const [relearningSteps, setRelearningSteps] = useState('');
  // Local draft mirroring the fsrs-nested fields (target retention, fuzz, max interval,
  // learning/relearning steps) — every commit for those fields patches from this draft
  // rather than re-reading `course.fsrsParameters`, which resolves asynchronously via
  // useLiveQuery and would otherwise race a second commit made before the first round-trip
  // completes (see commitFsrsParameters below). Mirrors how linearCadence already avoids
  // this exact bug.
  const [fsrsParameters, setFsrsParameters] = useState<FsrsParameters>(defaultFsrsParameters());
  const [leechThreshold, setLeechThreshold] = useState('');
  const [leechAction, setLeechAction] = useState<'suspend' | 'tag' | 'none'>('suspend');
  const [dailyReviewGoal, setDailyReviewGoal] = useState('');
  const [sessionTimeLimit, setSessionTimeLimit] = useState('');
  const [unlockMode, setUnlockMode] = useState<UnlockMode>('semi-linear');
  const [linearCadence, setLinearCadence] = useState({ anchorDate: Date.now(), intervalDays: 7 });
  const [autoPractice, setAutoPractice] = useState(true);
  const [practiceThresholdMinutesFar, setPracticeThresholdMinutesFar] = useState('');
  const [practiceThresholdMinutesNear, setPracticeThresholdMinutesNear] = useState('');
  const [practiceUrgentWindowDays, setPracticeUrgentWindowDays] = useState('');
  const [practiceMaxGap, setPracticeMaxGap] = useState('');
  const [lessonViewMode, setLessonViewMode] = useState<LessonViewMode>('study');
  const [loaded, setLoaded] = useState(false);

  // Re-arm the loaded latch whenever the course changes so back/forward navigation
  // between different course settings routes re-seeds the form.
  useEffect(() => {
    setLoaded(false);
  }, [courseId]);

  useEffect(() => {
    if (loaded || !course) return;
    setName(course.name);
    setExamBoard(course.examBoard ?? '');
    setSpecification(course.specification ?? '');
    setTimeZone(course.timeZone);
    setObjective(course.examObjective);
    setNewPerDay(course.newCardsPerDay ? String(course.newCardsPerDay) : '');
    setMaxReviewsPerDay(course.maxReviewsPerDay ? String(course.maxReviewsPerDay) : '');
    setRetention(clampRequestRetention(course.fsrsParameters.requestRetention));
    setEnableFuzz(course.fsrsParameters.enable_fuzz ?? true);
    setMaxInterval(
      course.fsrsParameters.maximum_interval ? String(course.fsrsParameters.maximum_interval) : '',
    );
    setLearningSteps(course.fsrsParameters.learning_steps.join(', '));
    setRelearningSteps(course.fsrsParameters.relearning_steps.join(', '));
    setFsrsParameters(course.fsrsParameters);
    setLeechThreshold(course.leechThreshold ? String(course.leechThreshold) : '');
    setLeechAction(course.leechAction ?? 'suspend');
    setDailyReviewGoal(course.dailyReviewGoal ? String(course.dailyReviewGoal) : '');
    setSessionTimeLimit(
      course.sessionTimeLimitMinutes ? String(course.sessionTimeLimitMinutes) : '',
    );
    setUnlockMode(course.unlockMode);
    setLinearCadence(course.linearCadence ?? { anchorDate: Date.now(), intervalDays: 7 });
    setAutoPractice(course.autoPractice);
    setPracticeThresholdMinutesFar(String(course.practiceThresholdMinutesFar));
    setPracticeThresholdMinutesNear(String(course.practiceThresholdMinutesNear));
    setPracticeUrgentWindowDays(String(course.practiceUrgentWindowDays));
    setPracticeMaxGap(String(course.practiceMaxGap));
    setLessonViewMode(course.lessonViewMode ?? 'study');
    setLoaded(true);
  }, [course, loaded]);

  if (course === undefined) {
    return <CourseSettingsSkeleton />;
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  /**
   * Parse a non-optional numeric field, falling back to the current course value on
   * blank/NaN/negative input. Zero is accepted when `allowZero` is set — it is a
   * meaningful value for the practice threshold, urgent-window and max-gap fields
   * (see src/fsrs/practice.ts), unlike the other fields parsed inline below.
   */
  function parsePositiveIntOr(value: string, fallback: number, allowZero = false): number {
    const parsed = Math.floor(Number(value));
    const min = allowZero ? 0 : 1;
    return value.trim() === '' || !Number.isFinite(parsed) || parsed < min ? fallback : parsed;
  }

  /** Single instant-commit entry point: every field patches the course through here. */
  function commitCourse(patch: Partial<CourseRecord>) {
    if (!course) return;
    void updateCourse(course.id, patch);
  }

  /**
   * Commit entry point for the fsrs-nested fields (target retention, fuzz, max interval,
   * learning/relearning steps). Patches the local `fsrsParameters` draft rather than
   * `course.fsrsParameters` so two commits fired in quick succession — faster than the
   * live query round-trip — don't have the second overwrite the first (see the
   * `fsrsParameters` state comment above).
   */
  function commitFsrsParameters(patch: Partial<FsrsParameters>) {
    const next = { ...fsrsParameters, ...patch };
    setFsrsParameters(next);
    commitCourse({ fsrsParameters: next });
  }

  function commitName() {
    if (!course) return;
    const value = name.trim() || course.name;
    if (value !== name) setName(value);
    commitCourse({ name: value });
  }

  function commitExamBoard() {
    const value = examBoard.trim() || undefined;
    setExamBoard(value ?? '');
    commitCourse({ examBoard: value });
  }

  function commitSpecification() {
    const value = specification.trim() || undefined;
    setSpecification(value ?? '');
    commitCourse({ specification: value });
  }

  function commitNewCardsPerDay() {
    const parsed = Math.floor(Number(newPerDay));
    const value =
      newPerDay.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? undefined : parsed;
    commitCourse({ newCardsPerDay: value });
  }

  function commitMaxReviewsPerDay() {
    const parsed = Math.floor(Number(maxReviewsPerDay));
    const value =
      maxReviewsPerDay.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
        ? undefined
        : parsed;
    commitCourse({ maxReviewsPerDay: value });
  }

  function commitMaxInterval() {
    const parsed = Math.floor(Number(maxInterval));
    const value =
      maxInterval.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
        ? fsrsParameters.maximum_interval
        : parsed;
    commitFsrsParameters({ maximum_interval: value });
  }

  function commitLearningSteps() {
    const value = parseSteps(learningSteps);
    if (learningSteps.trim() && value === null) {
      notify('Invalid learning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    commitFsrsParameters({ learning_steps: value ?? fsrsParameters.learning_steps });
  }

  function commitRelearningSteps() {
    const value = parseSteps(relearningSteps);
    if (relearningSteps.trim() && value === null) {
      notify('Invalid relearning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    commitFsrsParameters({ relearning_steps: value ?? fsrsParameters.relearning_steps });
  }

  function commitLeechThreshold() {
    const parsed = Math.floor(Number(leechThreshold));
    const value =
      leechThreshold.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? undefined : parsed;
    commitCourse({ leechThreshold: value });
  }

  function commitDailyReviewGoal() {
    const parsed = Math.floor(Number(dailyReviewGoal));
    const value =
      dailyReviewGoal.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? undefined : parsed;
    commitCourse({ dailyReviewGoal: value });
  }

  function commitSessionTimeLimit() {
    const parsed = Math.floor(Number(sessionTimeLimit));
    const value =
      sessionTimeLimit.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
        ? undefined
        : parsed;
    commitCourse({ sessionTimeLimitMinutes: value });
  }

  function commitLinearCadence(cadence: { anchorDate: number; intervalDays: number }) {
    commitCourse({ linearCadence: cadence });
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8 md:px-10">
      <div className="min-w-0 max-w-2xl flex-1">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
          >
            <ChevronLeftIcon width={16} height={16} />
            All courses
          </Link>
          <CourseTabs courseId={course.id} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 * m }}
        >
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, ease: [0.16, 1, 0.3, 1] }}
            className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8"
          >
            <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
            <div className="relative">
              <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">Course</p>
              <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
            </div>
          </motion.header>

          <SectionRailMobileJumper
            sections={COURSE_SETTINGS_SECTIONS}
            activeSection={activeSection}
            onNavigate={goToSection}
          />

          <div className="flex flex-col gap-10">
            <div id="course-settings-basics" className="flex flex-col gap-6">
              <h2 className="font-display text-2xl">Basics</h2>
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.05 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <div className="flex flex-col gap-4">
                  <label className="block text-sm text-ink-soft">
                    Course name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={commitName}
                      className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <label className="block text-sm text-ink-soft">
                    Exam board
                    <input
                      value={examBoard}
                      onChange={(e) => setExamBoard(e.target.value)}
                      onBlur={commitExamBoard}
                      className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <label className="block text-sm text-ink-soft">
                    Specification
                    <input
                      value={specification}
                      onChange={(e) => setSpecification(e.target.value)}
                      onBlur={commitSpecification}
                      className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <div className="block text-sm text-ink-soft">
                    <div className="mb-2">Exam objective</div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-ink-faint">
                        {objective === 'securedTopics'
                          ? 'Secure as many topics as possible: prioritise cards a review would push to 90%+ on exam day. The progress bar shows the fraction of cards secured.'
                          : 'Maximise your expected marks: prioritise the largest expected lift to exam-day retrievability. The progress bar shows your mean predicted retrievability.'}
                      </p>
                      <Toggle
                        checked={objective === 'securedTopics'}
                        onChange={(checked) => {
                          const next: ExamObjective = checked ? 'securedTopics' : 'expectedMarks';
                          setObjective(next);
                          commitCourse({ examObjective: next });
                        }}
                        label="Secure topics"
                      />
                    </div>
                  </div>
                </div>
              </motion.section>
            </div>

            <div id="course-settings-study" className="flex flex-col gap-6">
              <h2 className="font-display text-2xl">Study</h2>
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.06 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <h3 className="mb-4 font-display text-xl">Scheduling</h3>
                <div className="flex flex-col gap-4">
                  <SchedulingFieldsSection
                    newCardsPerDay={newPerDay}
                    onNewCardsPerDayChange={setNewPerDay}
                    onNewCardsPerDayBlur={commitNewCardsPerDay}
                    maxReviewsPerDay={maxReviewsPerDay}
                    onMaxReviewsPerDayChange={setMaxReviewsPerDay}
                    onMaxReviewsPerDayBlur={commitMaxReviewsPerDay}
                    retention={retention}
                    onRetentionChange={setRetention}
                    onRetentionCommit={(value) => {
                      setRetention(value);
                      commitFsrsParameters({ requestRetention: clampRequestRetention(value) });
                    }}
                    enableFuzz={enableFuzz}
                    onEnableFuzzChange={(checked) => {
                      setEnableFuzz(checked);
                      commitFsrsParameters({ enable_fuzz: checked });
                    }}
                    maxInterval={maxInterval}
                    onMaxIntervalChange={setMaxInterval}
                    onMaxIntervalBlur={commitMaxInterval}
                    maxIntervalPlaceholder={String(course.fsrsParameters.maximum_interval ?? 36500)}
                    learningSteps={learningSteps}
                    onLearningStepsChange={setLearningSteps}
                    onLearningStepsBlur={commitLearningSteps}
                    relearningSteps={relearningSteps}
                    onRelearningStepsChange={setRelearningSteps}
                    onRelearningStepsBlur={commitRelearningSteps}
                    leechThreshold={leechThreshold}
                    onLeechThresholdChange={setLeechThreshold}
                    onLeechThresholdBlur={commitLeechThreshold}
                    leechAction={leechAction}
                    onLeechActionChange={(value) => {
                      setLeechAction(value);
                      commitCourse({ leechAction: value });
                    }}
                    dailyReviewGoal={dailyReviewGoal}
                    onDailyReviewGoalChange={setDailyReviewGoal}
                    onDailyReviewGoalBlur={commitDailyReviewGoal}
                    sessionTimeLimit={sessionTimeLimit}
                    onSessionTimeLimitChange={setSessionTimeLimit}
                    onSessionTimeLimitBlur={commitSessionTimeLimit}
                  />
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.08 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <UnlockModeSection
                  unlockMode={unlockMode}
                  onUnlockModeChange={(mode) => {
                    setUnlockMode(mode);
                    commitCourse({ unlockMode: mode });
                  }}
                  linearCadence={linearCadence}
                  onAnchorDateChange={(ms) => {
                    const next = { ...linearCadence, anchorDate: ms };
                    setLinearCadence(next);
                    commitLinearCadence(next);
                  }}
                  onIntervalDaysChange={(days) =>
                    setLinearCadence((prev) => ({ ...prev, intervalDays: days }))
                  }
                  onIntervalDaysBlur={() => commitLinearCadence(linearCadence)}
                  timeZone={timeZone}
                />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.1 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <h3 className="mb-4 font-display text-xl">Auto-practice</h3>
                <PracticeSettingsSection
                  autoPractice={autoPractice}
                  onAutoPracticeChange={(checked) => {
                    setAutoPractice(checked);
                    commitCourse({ autoPractice: checked });
                  }}
                  practiceThresholdMinutesFar={practiceThresholdMinutesFar}
                  onPracticeThresholdMinutesFarChange={setPracticeThresholdMinutesFar}
                  onPracticeThresholdMinutesFarBlur={() =>
                    commitCourse({
                      practiceThresholdMinutesFar: parsePositiveIntOr(
                        practiceThresholdMinutesFar,
                        course.practiceThresholdMinutesFar,
                        true,
                      ),
                    })
                  }
                  practiceThresholdMinutesNear={practiceThresholdMinutesNear}
                  onPracticeThresholdMinutesNearChange={setPracticeThresholdMinutesNear}
                  onPracticeThresholdMinutesNearBlur={() =>
                    commitCourse({
                      practiceThresholdMinutesNear: parsePositiveIntOr(
                        practiceThresholdMinutesNear,
                        course.practiceThresholdMinutesNear,
                        true,
                      ),
                    })
                  }
                  practiceUrgentWindowDays={practiceUrgentWindowDays}
                  onPracticeUrgentWindowDaysChange={setPracticeUrgentWindowDays}
                  onPracticeUrgentWindowDaysBlur={() =>
                    commitCourse({
                      practiceUrgentWindowDays: parsePositiveIntOr(
                        practiceUrgentWindowDays,
                        course.practiceUrgentWindowDays,
                        true,
                      ),
                    })
                  }
                  practiceMaxGap={practiceMaxGap}
                  onPracticeMaxGapChange={setPracticeMaxGap}
                  onPracticeMaxGapBlur={() =>
                    // Maximum lesson gap is a backstop count of lessons; the input's min={1}
                    // (PracticeSettingsSection) reflects that zero has no meaningful gap semantics.
                    commitCourse({
                      practiceMaxGap: parsePositiveIntOr(practiceMaxGap, course.practiceMaxGap),
                    })
                  }
                />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.12 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <h3 className="mb-4 font-display text-xl">Lesson view</h3>
                <LessonViewModeSection
                  lessonViewMode={lessonViewMode}
                  onLessonViewModeChange={(mode) => {
                    setLessonViewMode(mode);
                    commitCourse({ lessonViewMode: mode });
                  }}
                />
              </motion.section>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.14 * m, ease: [0.16, 1, 0.3, 1] }}
              >
                <OptimisationPanel
                  entity={course}
                  cards={cards ?? []}
                  reviewHistory={reviewHistory}
                  onUpdate={(changes) => updateCourse(course.id, changes)}
                  entityLabel="course"
                />
              </motion.div>
            </div>

            <div id="course-settings-content" className="flex flex-col gap-6">
              <h2 className="font-display text-2xl">Content</h2>
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <h3 className="mb-4 font-display text-xl">Lessons</h3>
                <LessonManagementSection courseId={course.id} />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <h3 className="mb-4 font-display text-xl">Practice nodes</h3>
                <PracticeNodesSection courseId={course.id} />
              </motion.section>
            </div>

            <div id="course-settings-assessments" className="flex flex-col gap-6">
              <h2 className="font-display text-2xl">Assessments</h2>
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
              >
                <ExamDatesSection courseId={course.id} timeZone={timeZone} />
              </motion.section>
            </div>

            <div id="course-settings-danger" className="flex flex-col gap-6">
              {course.distributedCopy?.locked === true && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24 * m, delay: 0.21 * m, ease: [0.16, 1, 0.3, 1] }}
                >
                  <DetachCourseSection
                    courseId={course.id}
                    autoAcceptUpdates={course.distributedCopy?.autoAcceptUpdates === true}
                  />
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 * m, delay: 0.22 * m, ease: [0.16, 1, 0.3, 1] }}
              >
                <DangerZoneSection
                  entityLabel="course"
                  entityName={course.name}
                  description="Deleting this course removes all of its lessons, notes and card assignments."
                  snapshot={() => snapshotCourse(course.id)}
                  onDelete={() => deleteCourse(course.id)}
                  onRestore={(snap) => restoreCourse(snap as CourseSnapshot)}
                  onDeleted={() => navigate('/')}
                />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      <SectionRail
        sections={COURSE_SETTINGS_SECTIONS}
        activeSection={activeSection}
        onNavigate={goToSection}
        motionMultiplier={m}
      />
    </div>
  );
}

function CourseSettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-48 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-4">
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-ink/10" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-8 w-32 animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="rounded-2xl border border-negative/30 bg-negative/5 p-6 space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-full animate-pulse rounded bg-ink/10" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-ink/10" />
        </div>
      </div>
    </div>
  );
}
