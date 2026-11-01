import { useEffect, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { updateCourse } from '../../db/courseRepository';
import type {
  Course,
  CourseRecord,
  ExamObjective,
  FsrsParameters,
  UnlockMode,
} from '../../db/types';
import {
  clampRequestRetention,
  defaultFsrsParameters,
  DEFAULT_REQUEST_RETENTION,
} from '../../fsrs/params';
import type { SchedulingFieldsSectionProps } from './SchedulingFieldsSection';
import { parseSteps } from './parseSteps';

/** Local drafts preserve blur saves and consecutive nested scheduling edits. */
export function useCourseSettingsForm(course: Course | null | undefined, courseId?: string) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [examBoard, setExamBoard] = useState('');
  const [specification, setSpecification] = useState('');
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [objective, setObjective] = useState<ExamObjective>('expectedMarks');
  const [newPerDay, setNewPerDay] = useState('');
  const [learnFirst, setLearnFirst] = useState(true);
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
    setLearnFirst(course.learnFirst !== false);
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
    setLoaded(true);
  }, [course, loaded]);

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

  const schedulingFields: SchedulingFieldsSectionProps = {
    newCardsPerDay: newPerDay,
    onNewCardsPerDayChange: setNewPerDay,
    onNewCardsPerDayBlur: commitNewCardsPerDay,
    maxReviewsPerDay,
    onMaxReviewsPerDayChange: setMaxReviewsPerDay,
    onMaxReviewsPerDayBlur: commitMaxReviewsPerDay,
    enableFuzz,
    onEnableFuzzChange: (checked) => {
      setEnableFuzz(checked);
      commitFsrsParameters({ enable_fuzz: checked });
    },
    maxInterval,
    onMaxIntervalChange: setMaxInterval,
    onMaxIntervalBlur: commitMaxInterval,
    maxIntervalPlaceholder: String(course?.fsrsParameters.maximum_interval ?? 36500),
    learningSteps,
    onLearningStepsChange: setLearningSteps,
    onLearningStepsBlur: commitLearningSteps,
    relearningSteps,
    onRelearningStepsChange: setRelearningSteps,
    onRelearningStepsBlur: commitRelearningSteps,
    leechThreshold,
    onLeechThresholdChange: setLeechThreshold,
    onLeechThresholdBlur: commitLeechThreshold,
    leechAction,
    onLeechActionChange: (value) => {
      setLeechAction(value);
      commitCourse({ leechAction: value });
    },
    dailyReviewGoal,
    onDailyReviewGoalChange: setDailyReviewGoal,
    onDailyReviewGoalBlur: commitDailyReviewGoal,
    sessionTimeLimit,
    onSessionTimeLimitChange: setSessionTimeLimit,
    onSessionTimeLimitBlur: commitSessionTimeLimit,
  };

  return {
    name,
    setName,
    examBoard,
    setExamBoard,
    specification,
    setSpecification,
    timeZone,
    objective,
    setObjective,
    learnFirst,
    setLearnFirst,
    retention,
    setRetention,
    unlockMode,
    setUnlockMode,
    linearCadence,
    setLinearCadence,
    autoPractice,
    setAutoPractice,
    practiceThresholdMinutesFar,
    setPracticeThresholdMinutesFar,
    practiceThresholdMinutesNear,
    setPracticeThresholdMinutesNear,
    practiceUrgentWindowDays,
    setPracticeUrgentWindowDays,
    practiceMaxGap,
    setPracticeMaxGap,
    parsePositiveIntOr,
    commitCourse,
    commitFsrsParameters,
    commitName,
    commitExamBoard,
    commitSpecification,
    commitLinearCadence,
    schedulingFields,
  };
}
