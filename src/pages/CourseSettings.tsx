import { Input } from '../components/ui/Field';
import { Skeleton } from '../components/ui/Skeleton';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCourse, useCourseCards, useCourseReviewHistory } from '../state/useCourseData';
import { useToast } from '../components/ui/Toast';
import {
  PillSwitch,
  SettingRow,
  SettingsArrivalProvider,
  SettingsCard,
} from './settings/SettingsUi';
import { TargetRecallCard } from './settings/TargetRecallCard';
import { SectionRail, SectionRailMobileJumper, useSectionRail } from '../components/ui/SectionRail';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import {
  deleteCourse,
  snapshotCourse,
  restoreCourse,
  updateCourse,
  type CourseSnapshot,
} from '../db/courseRepository';
import {
  clampRequestRetention,
  defaultFsrsParameters,
  DEFAULT_REQUEST_RETENTION,
} from '../fsrs/params';
import type { CourseRecord, ExamObjective, FsrsParameters, UnlockMode } from '../db/types';
import { parseSteps } from './settings/parseSteps';
import { SchedulingFieldsSection } from './settings/SchedulingFieldsSection';
import { OptimisationPanel } from './settings/OptimisationPanel';
import { UnlockModeSection } from './settings/UnlockModeSection';
import { PracticeSettingsSection } from './settings/PracticeSettingsSection';
import { ExamDatesSection } from './settings/ExamDatesSection';
import { LessonManagementSection } from './settings/LessonManagementSection';
import { PracticeNodesSection } from './settings/PracticeNodesSection';
import { DangerZoneSection } from './settings/DangerZoneSection';
import { DetachCourseSection } from './settings/DetachCourseSection';

const COURSE_SETTINGS_SECTIONS = [
  { id: 'course-settings-goal', label: 'Goal and dates' },
  { id: 'course-settings-study', label: 'Daily study' },
  { id: 'course-settings-content', label: 'Content' },
  { id: 'course-settings-danger', label: 'Danger zone' },
];

const FIELD_CLASS =
  'mt-2 w-full rounded-xl border-[1.5px] border-line bg-surface px-3.5 py-2.5 font-normal text-ink outline-none focus:border-ink';

/**
 * Full-page course settings, mirroring DeckSettings but for the Course/Lesson model:
 * scheduling fields, optimisation, unlock mode, auto-practice, exam dates and lesson
 * management, plus a danger zone. Edit mode belongs beside the course content rather
 * than being duplicated here. Laid out as one column of borderless cards (Goal and
 * dates, Daily study, Lessons, Auto-practice, then the danger zone) with one save model:
 * every field commits instantly through `updateCourse` (text/numeric inputs on blur,
 * toggles/selects on change) rather than being staged behind a "Save changes" button,
 * matching the pattern ExamDates/LessonManagement/PracticeNodes already used. Course
 * deletion uses the same snapshot + undo-toast pattern as deck deletion (see
 * DangerZoneSection), rather than a blocking confirmation.
 */
export function CourseSettings() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { notify } = useToast();

  // Use a null-sentinel to distinguish "loading" (undefined) from "not found"
  // (null), matching CoursePath's pattern — Dexie's .get() resolves to
  // undefined for a missing row, so useCourse alone cannot signal not-found.
  const course = useCourse(courseId);
  const cards = useCourseCards(courseId);
  const reviewHistory = useCourseReviewHistory(courseId);
  const { activeSection, goToSection } = useSectionRail(COURSE_SETTINGS_SECTIONS, m, !!course);

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

  if (course === undefined) {
    return (
      <DelayedFallback>
        <CourseSettingsSkeleton />
      </DelayedFallback>
    );
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to Today
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
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <header className="mb-8 pt-6 md:pt-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Course settings
        </h1>
      </header>
      <div className="flex flex-row-reverse gap-8">
        <div className="min-w-0 flex-1">
          <SettingsArrivalProvider>
            <SectionRailMobileJumper
              sections={COURSE_SETTINGS_SECTIONS}
              activeSection={activeSection}
              onNavigate={goToSection}
            />
            <div className="mx-auto max-w-3xl">
              <SettingsCard id="course-settings-goal" className="scroll-mt-24">
                <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">
                  Goal and dates
                </h2>
                <div className="flex flex-col gap-5">
                  <label className="block text-sm font-semibold text-ink">
                    Course name
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={commitName}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-ink">
                      Exam board
                      <Input
                        value={examBoard}
                        onChange={(e) => setExamBoard(e.target.value)}
                        onBlur={commitExamBoard}
                        className={FIELD_CLASS}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-ink">
                      Specification
                      <Input
                        value={specification}
                        onChange={(e) => setSpecification(e.target.value)}
                        onBlur={commitSpecification}
                        className={FIELD_CLASS}
                      />
                    </label>
                  </div>
                  <TargetRecallCard
                    retention={retention}
                    onChange={setRetention}
                    onCommit={(value) => {
                      setRetention(value);
                      commitFsrsParameters({ requestRetention: clampRequestRetention(value) });
                    }}
                  />
                  <div>
                    <SettingRow label="Exam objective">
                      <PillSwitch
                        checked={objective === 'securedTopics'}
                        onChange={(checked) => {
                          const next: ExamObjective = checked ? 'securedTopics' : 'expectedMarks';
                          setObjective(next);
                          commitCourse({ examObjective: next });
                        }}
                        label="Secure topics"
                      />
                    </SettingRow>
                    <p className="text-sm text-ink-soft">
                      {objective === 'securedTopics'
                        ? 'Prioritise cards a review would push to 90% or more on exam day. Progress shows the share of cards secured.'
                        : 'Prioritise the largest expected lift to exam-day recall. Progress shows your mean predicted recall.'}
                    </p>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard>
                <ExamDatesSection
                  courseId={course.id}
                  timeZone={timeZone}
                  editFinalOnMount={searchParams.get('editFinalExam') === '1'}
                />
              </SettingsCard>

              <SettingsCard id="course-settings-study" className="scroll-mt-24">
                <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">
                  Daily study
                </h2>
                <div className="flex flex-col gap-5">
                  <SettingRow label="Learn first">
                    <PillSwitch
                      checked={learnFirst}
                      onChange={(checked) => {
                        setLearnFirst(checked);
                        commitCourse({ learnFirst: checked });
                      }}
                      ariaLabel="Learn first"
                    />
                  </SettingRow>
                  <SchedulingFieldsSection
                    newCardsPerDay={newPerDay}
                    onNewCardsPerDayChange={setNewPerDay}
                    onNewCardsPerDayBlur={commitNewCardsPerDay}
                    maxReviewsPerDay={maxReviewsPerDay}
                    onMaxReviewsPerDayChange={setMaxReviewsPerDay}
                    onMaxReviewsPerDayBlur={commitMaxReviewsPerDay}
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
              </SettingsCard>

              <SettingsCard id="course-settings-content" className="scroll-mt-24">
                <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">Lessons</h2>
                <div className="flex flex-col gap-8">
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
                  <LessonManagementSection courseId={course.id} />
                  <div>
                    <h3 className="mb-3 font-semibold text-ink">Practice nodes</h3>
                    <PracticeNodesSection courseId={course.id} />
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard>
                <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">
                  Auto-practice
                </h2>
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
              </SettingsCard>

              <OptimisationPanel
                entity={course}
                cards={cards ?? []}
                reviewHistory={reviewHistory}
                onUpdate={(changes) => updateCourse(course.id, changes)}
                entityLabel="course"
                headingLevel={3}
              />

              <DetachCourseSection
                courseId={course.id}
                autoAcceptUpdates={course.distributedCopy?.autoAcceptUpdates === true}
              />

              <div id="course-settings-danger" className="scroll-mt-24">
                <DangerZoneSection
                  entityLabel="course"
                  entityName={course.name}
                  description="Deleting this course removes all of its lessons, notes and card assignments."
                  snapshot={() => snapshotCourse(course.id)}
                  onDelete={() => deleteCourse(course.id)}
                  onRestore={(snap) => restoreCourse(snap as CourseSnapshot)}
                  onDeleted={() => navigate('/')}
                />
              </div>
            </div>
          </SettingsArrivalProvider>
        </div>

        <SectionRail
          sections={COURSE_SETTINGS_SECTIONS}
          activeSection={activeSection}
          onNavigate={goToSection}
          motionMultiplier={m}
        />
      </div>
    </div>
  );
}

function CourseSettingsSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <Skeleton className="mb-8 mt-6 h-10 w-64 rounded-full bg-ink/10 md:mt-8" />
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {[40, 32, 24].map((height) => (
          <div key={height} className="space-y-4 rounded-3xl bg-surface p-7">
            <Skeleton className="h-6 w-40 rounded-full bg-ink/10" />
            <Skeleton
              className="w-full rounded-2xl bg-ink/10"
              style={{ height: height * 4 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
