import { PillToggleGroup } from '../components/cards/PillToggleGroup';
import { Input, fieldLabelClassName } from '../components/ui/Field';
import { Skeleton } from '../components/ui/Skeleton';
import {
  COURSE_PAGE_FRAME,
  COURSE_PAGE_HEADER,
  COURSE_PAGE_TITLE,
} from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import {
  useCourse,
  useCourseCards,
  useCourseReviewHistory,
} from '../state/useCourseData';
import {
  PillSwitch,
  SettingRow,
  SettingsArrivalProvider,
  SettingsCard,
} from './settings/SettingsUi';
import { TargetRecallCard } from './settings/TargetRecallCard';
import {
  deleteCourse,
  snapshotCourse,
  restoreCourse,
  updateCourse,
  type CourseSnapshot,
} from '../db/courseRepository';
import { clampRequestRetention } from '../fsrs/params';
import type { ExamObjective } from '../db/types';
import { SchedulingFieldsSection } from './settings/SchedulingFieldsSection';
import { OptimisationPanel } from './settings/OptimisationPanel';
import { UnlockModeSection } from './settings/UnlockModeSection';
import { PracticeSettingsSection } from './settings/PracticeSettingsSection';
import { ExamDatesSection } from './settings/ExamDatesSection';
import { LessonManagementSection } from './settings/LessonManagementSection';
import { PracticeNodesSection } from './settings/PracticeNodesSection';
import { DangerZoneSection } from './settings/DangerZoneSection';
import { DetachCourseSection } from './settings/DetachCourseSection';

import { useCourseSettingsForm } from './settings/useCourseSettingsForm';
import { formatDate } from '../utils/datetime';
import { CourseSettingsArchive } from './settings/CourseSettingsArchive';
import { CourseSettingsDisclosure } from './settings/CourseSettingsDisclosure';

/** Common edits lead; secondary settings expand in place without a separate save step. */
export function CourseSettings() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const course = useCourse(courseId);
  const cards = useCourseCards(courseId);
  const reviewHistory = useCourseReviewHistory(courseId);
  const {
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
  } = useCourseSettingsForm(course, courseId);

  if (course === undefined) {
    return <PageLoading fallback={<CourseSettingsSkeleton />} />;
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent-ink underline">
          Back to Today
        </Link>
      </div>
    );
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <header className={COURSE_PAGE_HEADER}>
        <h1 className={COURSE_PAGE_TITLE}>Course settings</h1>
      </header>
      <SettingsArrivalProvider>
        <div className="grid items-stretch gap-5 min-[1100px]:grid-cols-[1.15fr_1fr] [&>section]:mb-0">
          <SettingsCard id="course-settings-goal" className="min-w-0 min-[1100px]:row-span-2">
            <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight">
              Study goal and dates
            </h2>
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-sm text-ink-soft">Final exam</p>
                <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
                  {course.examDate === undefined ? (
                    'Steady retention'
                  ) : (
                    formatDate(course.examDate, course.timeZone ?? timeZone)
                  )}
                </p>
              </div>
              <div>
                <SettingRow label="Exam objective">
                  <PillToggleGroup
                    label="Exam objective"
                    size="sm"
                    value={objective}
                    onChange={(next: ExamObjective) => {
                      setObjective(next);
                      commitCourse({ examObjective: next });
                    }}
                    options={[
                      { value: 'expectedMarks', label: 'Most marks' },
                      { value: 'securedTopics', label: 'Secure topics' },
                    ]}
                  />
                </SettingRow>
                <p className="text-sm text-ink-soft">
                  {objective === 'securedTopics'
                    ? 'Brings as many cards as possible to 90% recall by exam day.'
                    : 'Lifts your overall exam-day recall the most.'}
                </p>
              </div>

              <div className="border-t border-ink/10 pt-6">
                <h3 className="mb-4 font-semibold text-ink">Assessments</h3>
                <ExamDatesSection
                  courseId={course.id}
                  timeZone={timeZone}
                  editFinalOnMount={searchParams.get('editFinalExam') === '1'}
                />
              </div>
            </div>
          </SettingsCard>
          <SettingsCard id="course-settings-study" className="min-w-0">
            <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">
              Daily workload
            </h2>
            <SchedulingFieldsSection {...schedulingFields} section="workload" />
          </SettingsCard>
          <SettingsCard className="min-w-0">
            <TargetRecallCard
              compact
              headingLevel={2}
              retention={retention}
              onChange={setRetention}
              onCommit={(value) => {
                setRetention(value);
                commitFsrsParameters({ requestRetention: clampRequestRetention(value) });
              }}
            />
          </SettingsCard>
        </div>
        <div className="mt-7 flex flex-col gap-2">
          <CourseSettingsDisclosure
            title="Course details"
            summary={
              [examBoard, specification].filter(Boolean).join(' · ') ||
              'Name, exam board and specification'
            }
          >
            <div className="flex flex-col gap-5">
              <label className={fieldLabelClassName}>
                Course name
                <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={fieldLabelClassName}>
                  Exam board
                  <Input
                    value={examBoard}
                    onChange={(e) => setExamBoard(e.target.value)}
                    onBlur={commitExamBoard}
                  />
                </label>
                <label className={fieldLabelClassName}>
                  Specification
                  <Input
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    onBlur={commitSpecification}
                  />
                </label>
              </div>
            </div>
          </CourseSettingsDisclosure>
          <CourseSettingsDisclosure
            title="Lessons"
            summary={
              unlockMode === 'linear'
                ? 'Linear progression'
                : unlockMode === 'open'
                  ? 'Free progression'
                  : 'Semi-linear progression'
            }
          >
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
                onIntervalDaysCommit={(days) => {
                  const next = { ...linearCadence, intervalDays: days };
                  setLinearCadence(next);
                  commitLinearCadence(next);
                }}
                timeZone={timeZone}
              />
              <LessonManagementSection courseId={course.id} />
              <div>
                <h3 className="mb-3 font-semibold text-ink">Practice nodes</h3>
                <PracticeNodesSection courseId={course.id} />
              </div>
            </div>
          </CourseSettingsDisclosure>
          <CourseSettingsDisclosure title="Auto-practice" summary={autoPractice ? 'On' : 'Off'}>
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
          </CourseSettingsDisclosure>
          <CourseSettingsDisclosure
            title="Advanced scheduling"
            summary="Learning, intervals and optimisation"
          >
            <div className="mb-5">
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
            </div>
            <SchedulingFieldsSection {...schedulingFields} section="advanced" />{' '}
            <OptimisationPanel
              entity={course}
              cards={cards ?? []}
              reviewHistory={reviewHistory}
              onUpdate={(changes) => updateCourse(course.id, changes)}
              entityLabel="course"
              headingLevel={2}
            />
          </CourseSettingsDisclosure>
        </div>
        <div className="mt-8">
          {!course.archived && <CourseSettingsArchive course={course} />}
          {course.distributedCopy?.locked === true && (
            <DetachCourseSection
              courseId={course.id}
              autoAcceptUpdates={course.distributedCopy.autoAcceptUpdates === true}
            />
          )}

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
  );
}

function CourseSettingsSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <Skeleton className="mb-8 mt-6 h-10 w-64 rounded-full bg-ink/10 md:mt-8" />
      <div className="flex flex-col gap-5">
        {[40, 32, 24].map((height) => (
          <div key={height} className="space-y-4 rounded-3xl bg-surface p-7">
            <Skeleton className="h-6 w-40 rounded-full bg-ink/10" />
            <Skeleton className="w-full rounded-2xl bg-ink/10" style={{ height: height * 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
