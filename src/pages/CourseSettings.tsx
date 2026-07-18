import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourse, useCourseCards } from '../state/useCourseData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { useToast } from '../components/ui/Toast';
import {
  deleteCourse,
  snapshotCourse,
  restoreCourse,
  updateCourse,
} from '../db/repository';
import type { CourseSnapshot } from '../db/repository';
import { clampRequestRetention, DEFAULT_REQUEST_RETENTION } from '../fsrs/params';
import { ChevronLeftIcon } from '../components/ui/icons';
import type { ExamObjective, UnlockMode } from '../db/types';
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

/**
 * Full-page course settings, mirroring DeckSettings but for the Course/Lesson model:
 * scheduling fields, optimisation, unlock mode, auto-practice, exam dates and lesson
 * management, plus a danger zone. Course deletion uses the same snapshot + undo-toast
 * pattern as deck deletion (see DangerZoneSection), rather than a blocking confirmation.
 */
export function CourseSettings() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  // Use a null-sentinel to distinguish "loading" (undefined) from "not found"
  // (null), matching CoursePath's pattern — Dexie's .get() resolves to
  // undefined for a missing row, so useCourse alone cannot signal not-found.
  const course = useCourse(courseId);
  const cards = useCourseCards(courseId);

  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [objective, setObjective] = useState<ExamObjective>('expectedMarks');
  const [newPerDay, setNewPerDay] = useState('');
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState('');
  const [retention, setRetention] = useState(DEFAULT_REQUEST_RETENTION);
  const [enableFuzz, setEnableFuzz] = useState(true);
  const [maxInterval, setMaxInterval] = useState('');
  const [learningSteps, setLearningSteps] = useState('');
  const [relearningSteps, setRelearningSteps] = useState('');
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

  const coursePath = `/course/${course.id}`;

  /**
   * Parse a non-optional numeric field, falling back to the current course value on
   * blank/NaN/negative input. Zero is accepted when `allowZero` is set — it is a
   * meaningful value for the practice threshold, urgent-window and max-gap fields
   * (see src/fsrs/practice.ts), unlike the other fields parsed inline in handleSave.
   */
  function parsePositiveIntOr(value: string, fallback: number, allowZero = false): number {
    const parsed = Math.floor(Number(value));
    const min = allowZero ? 0 : 1;
    return value.trim() === '' || !Number.isFinite(parsed) || parsed < min ? fallback : parsed;
  }

  async function handleSave() {
    if (!course) return;
    const parsedCap = Math.floor(Number(newPerDay));
    const newCardsPerDay =
      newPerDay.trim() === '' || !Number.isFinite(parsedCap) || parsedCap <= 0
        ? undefined
        : parsedCap;
    const parsedReviews = Math.floor(Number(maxReviewsPerDay));
    const maxReviewsPerDayValue =
      maxReviewsPerDay.trim() === '' || !Number.isFinite(parsedReviews) || parsedReviews <= 0
        ? undefined
        : parsedReviews;
    const parsedMaxInterval = Math.floor(Number(maxInterval));
    const maxIntervalValue =
      maxInterval.trim() === '' || !Number.isFinite(parsedMaxInterval) || parsedMaxInterval <= 0
        ? course.fsrsParameters.maximum_interval
        : parsedMaxInterval;
    const parsedLeechThreshold = Math.floor(Number(leechThreshold));
    const leechThresholdValue =
      leechThreshold.trim() === '' ||
      !Number.isFinite(parsedLeechThreshold) ||
      parsedLeechThreshold <= 0
        ? undefined
        : parsedLeechThreshold;
    const parsedDailyGoal = Math.floor(Number(dailyReviewGoal));
    const dailyReviewGoalValue =
      dailyReviewGoal.trim() === '' || !Number.isFinite(parsedDailyGoal) || parsedDailyGoal <= 0
        ? undefined
        : parsedDailyGoal;
    const parsedTimeLimit = Math.floor(Number(sessionTimeLimit));
    const sessionTimeLimitValue =
      sessionTimeLimit.trim() === '' || !Number.isFinite(parsedTimeLimit) || parsedTimeLimit <= 0
        ? undefined
        : parsedTimeLimit;
    const learningStepsValue = parseSteps(learningSteps);
    if (learningSteps.trim() && learningStepsValue === null) {
      notify('Invalid learning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    const relearningStepsValue = parseSteps(relearningSteps);
    if (relearningSteps.trim() && relearningStepsValue === null) {
      notify('Invalid relearning steps format. Use values like 1m, 10m, 1d.', 'negative');
      return;
    }
    await updateCourse(course.id, {
        name: name.trim() || course.name,
        examObjective: objective,
        newCardsPerDay,
        maxReviewsPerDay: maxReviewsPerDayValue,
        leechThreshold: leechThresholdValue,
        leechAction,
        dailyReviewGoal: dailyReviewGoalValue,
        sessionTimeLimitMinutes: sessionTimeLimitValue,
        fsrsParameters: {
          ...course.fsrsParameters,
          requestRetention: clampRequestRetention(retention),
          enable_fuzz: enableFuzz,
          maximum_interval: maxIntervalValue,
          learning_steps: learningStepsValue ?? course.fsrsParameters.learning_steps,
          relearning_steps: relearningStepsValue ?? course.fsrsParameters.relearning_steps,
        },
        unlockMode,
        linearCadence,
        autoPractice,
        practiceThresholdMinutesFar: parsePositiveIntOr(
          practiceThresholdMinutesFar,
          course.practiceThresholdMinutesFar,
          true,
        ),
        practiceThresholdMinutesNear: parsePositiveIntOr(
          practiceThresholdMinutesNear,
          course.practiceThresholdMinutesNear,
          true,
        ),
        practiceUrgentWindowDays: parsePositiveIntOr(
          practiceUrgentWindowDays,
          course.practiceUrgentWindowDays,
          true,
        ),
        // Maximum lesson gap is a backstop count of lessons; the input's min={1}
        // (PracticeSettingsSection) reflects that zero has no meaningful gap semantics.
        practiceMaxGap: parsePositiveIntOr(practiceMaxGap, course.practiceMaxGap),
        lessonViewMode,
    });
    notify('Course updated.', 'positive');
    navigate(coursePath);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <Link
        to={coursePath}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Back to {course.name}
      </Link>

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

        <div className="flex flex-col gap-6">
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
                    onChange={(checked) =>
                      setObjective(checked ? 'securedTopics' : 'expectedMarks')
                    }
                    label="Secure topics"
                  />
                </div>
              </div>

              <SchedulingFieldsSection
                newCardsPerDay={newPerDay}
                onNewCardsPerDayChange={setNewPerDay}
                maxReviewsPerDay={maxReviewsPerDay}
                onMaxReviewsPerDayChange={setMaxReviewsPerDay}
                retention={retention}
                onRetentionChange={setRetention}
                enableFuzz={enableFuzz}
                onEnableFuzzChange={setEnableFuzz}
                maxInterval={maxInterval}
                onMaxIntervalChange={setMaxInterval}
                maxIntervalPlaceholder={String(course.fsrsParameters.maximum_interval ?? 36500)}
                learningSteps={learningSteps}
                onLearningStepsChange={setLearningSteps}
                relearningSteps={relearningSteps}
                onRelearningStepsChange={setRelearningSteps}
                leechThreshold={leechThreshold}
                onLeechThresholdChange={setLeechThreshold}
                leechAction={leechAction}
                onLeechActionChange={setLeechAction}
                dailyReviewGoal={dailyReviewGoal}
                onDailyReviewGoalChange={setDailyReviewGoal}
                sessionTimeLimit={sessionTimeLimit}
                onSessionTimeLimitChange={setSessionTimeLimit}
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
              onUnlockModeChange={setUnlockMode}
              linearCadence={linearCadence}
              onLinearCadenceChange={setLinearCadence}
              timeZone={timeZone}
            />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.1 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <h2 className="mb-4 font-display text-xl">Auto-practice</h2>
            <PracticeSettingsSection
              autoPractice={autoPractice}
              onAutoPracticeChange={setAutoPractice}
              practiceThresholdMinutesFar={practiceThresholdMinutesFar}
              onPracticeThresholdMinutesFarChange={setPracticeThresholdMinutesFar}
              practiceThresholdMinutesNear={practiceThresholdMinutesNear}
              onPracticeThresholdMinutesNearChange={setPracticeThresholdMinutesNear}
              practiceUrgentWindowDays={practiceUrgentWindowDays}
              onPracticeUrgentWindowDaysChange={setPracticeUrgentWindowDays}
              practiceMaxGap={practiceMaxGap}
              onPracticeMaxGapChange={setPracticeMaxGap}
            />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.12 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <h2 className="mb-4 font-display text-xl">Lesson view</h2>
            <LessonViewModeSection
              lessonViewMode={lessonViewMode}
              onLessonViewModeChange={setLessonViewMode}
            />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.14 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <h2 className="mb-4 font-display text-xl">Assessments</h2>
            <ExamDatesSection courseId={course.id} timeZone={timeZone} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <h2 className="mb-4 font-display text-xl">Lessons</h2>
            <LessonManagementSection courseId={course.id} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm shadow-black/[0.02]"
          >
            <h2 className="mb-4 font-display text-xl">Practice nodes</h2>
            <PracticeNodesSection courseId={course.id} />
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * m, delay: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
          >
            <OptimisationPanel
              entity={course}
              cards={cards ?? []}
              onUpdate={(changes) => updateCourse(course.id, changes)}
              entityLabel="course"
            />
          </motion.div>

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
      </motion.div>

      {/* Sticky action bar (stays within the content column, clear of the sidebar) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 * m, delay: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
        className="sticky bottom-0 z-30 -mx-6 mt-8 border-t border-line bg-paper/80 px-6 py-4 backdrop-blur-xl md:-mx-10 md:px-10"
      >
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate(coursePath)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSave()}>
            Save changes
          </Button>
        </div>
      </motion.div>
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
