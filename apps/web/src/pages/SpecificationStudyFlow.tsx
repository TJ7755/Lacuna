import { useMemo, useState } from 'react';
import { makeId } from '../db/schema';
import { useLeaveFlow } from '../utils/editorOrigin';
import { useCourseStudyFlowRecords } from '../state/useCourseStudyFlowRecords';
import { useCourseConceptPractice } from '../state/useCourseConceptPractice';
import { resolveSpecificationStudyScope } from '../course/specificationStudyScope';
import { STUDY_REVIEW_BLOCK_SIZE } from '../course/studyFlowPlanner';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { StudyExitHeader } from '../components/learn/StudyExitHeader';
import { StudyFlowMessage } from '../components/learn/StudyFlowMessage';
import { StudyQuestionStep } from '../components/learn/StudyQuestionStep';
import { resolveCourseSessionSelection } from './learn/sessionPool';
import { prepareSpecificationSessionPool } from './learn/specificationSessionPool';
import { LearnMode, type LearnSessionRequest } from './LearnMode';

/** One point-scoped recall block and one fresh Question, without widening into the course. */
export function SpecificationStudyFlow({
  courseId,
  pointId,
  assessmentId,
}: {
  courseId: string;
  pointId: string;
  assessmentId?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionId] = useState(makeId);
  const [recallFinished, setRecallFinished] = useState(false);
  const [finished, setFinished] = useState(false);
  const [questionEntry, setQuestionEntry] = useState<{
    conceptId: string;
    scopeConceptIds: string[];
  } | null>(null);
  const records = useCourseStudyFlowRecords(courseId, refreshKey);
  const leave = useLeaveFlow(
    `/course/${courseId}/analytics${assessmentId ? `?assessment=${encodeURIComponent(assessmentId)}` : ''}`,
  );
  const entry = useMemo(() => {
    if (!records?.course) return null;
    const scope = resolveSpecificationStudyScope({
      ...records,
      course: records.course,
      concepts: records.concepts ?? [],
      pointId,
      assessmentId,
    });
    if (!scope) return null;
    const request = {
      standaloneSimple: false,
      requestScopeLessonIds: undefined,
      requestSpecificationPointId: pointId,
      requestAssessmentId: assessmentId,
      practiceNodeKeyParam: null,
      filterParams: [],
      examPractice: false,
      catchUpPractice: false,
    };
    const source = {
      allCards: records.cards,
      courseLessons: records.lessons,
      examDates: records.assessments,
      manualNodes: records.practiceNodes,
      courseLinks: records.links,
      courseExposures: records.exposures,
      concepts: records.concepts ?? [],
    };
    const selection = resolveCourseSessionSelection(records.course, source, request);
    const recall = prepareSpecificationSessionPool(
      records.course,
      source,
      selection,
      request,
      null,
    );
    const accessible = new Set(records.questionScopeConceptIds ?? []);
    const conceptIds = scope.conceptIds.filter((id) => accessible.has(id));
    return { scope, recall: recall.cards.length > 0, conceptIds };
  }, [records, pointId, assessmentId]);
  const practice = useCourseConceptPractice(entry ? courseId : undefined, entry?.conceptIds ?? []);
  const question = practice?.find((item) => item.unfinished || item.unseenCount > 0);
  const request = useMemo<LearnSessionRequest>(
    () =>
      assessmentId
        ? {
            kind: 'practice',
            courseId,
            mode: 'assessment',
            assessmentId,
            specificationPointId: pointId,
            reviewLimit: STUDY_REVIEW_BLOCK_SIZE,
          }
        : {
            kind: 'practice',
            courseId,
            mode: 'curricular',
            specificationPointId: pointId,
            reviewLimit: STUDY_REVIEW_BLOCK_SIZE,
          },
    [courseId, pointId, assessmentId],
  );
  // Freeze the initial choice. Review writes must not unmount an active recall block.
  const [recallStarted, setRecallStarted] = useState<boolean | null>(null);
  if (recallStarted === null && entry) setRecallStarted(entry.recall);

  if (
    records === undefined ||
    (recallFinished && records.generation !== refreshKey) ||
    (!questionEntry && practice === undefined && (recallFinished || recallStarted === false))
  )
    return (
      <div className="min-h-dvh bg-paper">
        <StudyExitHeader onExit={leave} />
        <PageLoading />
      </div>
    );
  if (!entry)
    return (
      <StudyFlowMessage
        title="Specification practice unavailable"
        detail="This point or assessment no longer applies to the course. Return to Progress to choose another scope."
        onExit={leave}
      />
    );
  if (finished)
    return (
      <StudyFlowMessage
        title="Scoped practice complete"
        detail={`You have finished this practice for ${entry.scope.title}. Return to Progress to choose what comes next.`}
        onExit={leave}
      />
    );
  if (recallStarted && !recallFinished)
    return (
      <LearnMode
        request={request}
        sessionId={sessionId}
        onFlowExit={leave}
        onStepFinished={() => {
          setRecallFinished(true);
          setRefreshKey((key) => key + 1);
        }}
      />
    );
  if (questionEntry || question) {
    const next = questionEntry ?? {
      conceptId: question!.conceptId,
      scopeConceptIds: entry.conceptIds,
    };
    if (!questionEntry) setQuestionEntry(next);
    return (
      <StudyQuestionStep
        courseId={courseId}
        conceptId={next.conceptId}
        scopeConceptIds={next.scopeConceptIds}
        onComplete={() => setFinished(true)}
        onExit={leave}
      />
    );
  }
  return (
    <StudyFlowMessage
      title={recallFinished ? 'Scoped practice complete' : 'No practice ready for this point'}
      detail={`${entry.scope.title}: no fresh exam questions or eligible recall cards are ready. Existing lesson access and introductions still apply; repeated questions are not counted as fresh practice.`}
      onExit={leave}
    />
  );
}
