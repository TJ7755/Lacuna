import { db, makeId } from './schema';
import { assertShareLessonPrerequisites } from './lessonPrerequisites';
import { parseQuestionSetPracticeNode } from './questionSetPracticeNode';
import { createCards } from './cardRepository';
import { createCourse } from './courseRepository';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  syncCourseSchedulingUnits,
} from './backingDecks';
import { clampRequestRetention, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import type { ParsedCard } from './import';
import type {
  Card,
  CourseAssessment,
  ItemPayload,
  Lesson,
  LessonCardLink,
  Note,
} from '@lacuna/core/db/types';
import type { Concept, QuestionConceptSet, QuestionDefinition } from '@lacuna/core/questions/types';
import { finalAssessmentForCourse } from './assessmentMigration';
import { updateCourseAssessment } from './assessmentRepository';
import { LABEL_CARD_SUFFIX } from './sequenceGeneration';
import { conceptIdForSequenceItem, conceptIdForRegion } from '../questions/generatedConceptIds';
import { planSharedSequences, planSharedOcclusions } from './shareCourseGeneratedPlanning';
import { assertValidCardPayload } from '../items/payloadValidation';
import { emptyQuestionSchedule } from '../questions/scheduler';
import { questionGeneratorRegistry } from '../questions/generators';
import { importSharedQuestionSets } from '../questions/questionSetShare';
import { V1_SHARE_CODE_MESSAGE, assertShareSpecificationAssessments } from './sharePayload';
import type {
  ShareCard,
  SharePayload,
  SharePayloadV2,
  SharePayloadV3,
  SharePayloadV4,
  SharePayloadV5,
  SharePayloadV6,
} from './sharePayload';

function unpackCard(sc: ShareCard): ParsedCard[] {
  const attributes = {
    ...(sc.g?.length ? { tags: sc.g } : {}),
    ...(sc.am ? { answerMode: sc.am } : {}),
  };
  if (sc.p !== undefined) {
    assertValidCardPayload(sc.k === 1 ? 'cloze' : 'front_back', sc.p);
  }
  const payload = sc.p !== undefined ? { payload: sc.p as ItemPayload } : {};
  if (sc.k === 1) return [{ type: 'cloze', front: sc.f, back: '', ...attributes, ...payload }];
  if (sc.k === 2) {
    const back = sc.b ?? '';
    return [
      { type: 'front_back', front: sc.f, back, ...attributes, ...payload },
      { type: 'front_back', front: back, back: sc.f, ...attributes, ...payload },
    ];
  }
  // k === 3 (typing) and k === 0 (front/back) both unpack to a plain front_back
  // card — typing is a retired card type, folded here for older share codes.
  return [{ type: 'front_back', front: sc.f, back: sc.b ?? '', ...attributes, ...payload }];
}

/** The result of importing a share payload: everything created. */
export interface ImportShareResult {
  courses: number;
  lessons: number;
  cards: number;
  questions: number;
  courseIds: string[];
}

/** Split a sequenceItemId into its base item id and, when present, the label-card suffix. */
function splitSequenceItemId(si: string): { baseId: string; isLabel: boolean } {
  if (si.endsWith(LABEL_CARD_SUFFIX)) {
    return { baseId: si.slice(0, -LABEL_CARD_SUFFIX.length), isLabel: true };
  }
  return { baseId: si, isLabel: false };
}

/** The learner's choice, kept separate from the publisher's payload and baseline. */
export type ImportCourseScheduling =
  { schedulingMode: 'steady' } | { schedulingMode: 'exam'; examDate: number; timeZone: string };

/** Call inside the import transaction, after published assessments have been adopted. */
export async function applyImportedCourseScheduling(
  courseId: string,
  scheduling: ImportCourseScheduling,
): Promise<void> {
  const assessments = await db.courseAssessments.where('courseId').equals(courseId).toArray();
  const final = finalAssessmentForCourse(courseId, assessments);
  await updateCourseAssessment(final.id, scheduling);
}

/** Import a single-course payload directly into the course model. */
async function importCourseSharePayload(
  payload: SharePayloadV2 | SharePayloadV3 | SharePayloadV4 | SharePayloadV5 | SharePayloadV6,
  scheduling?: ImportCourseScheduling,
): Promise<ImportShareResult> {
  assertShareLessonPrerequisites(payload.lessons);
  assertShareSpecificationAssessments(payload);
  let cardCount = 0;
  let importedCourseId: string | null = null;

  await db.transaction(
    'rw',
    [
      db.courses,
      db.lessons,
      db.notes,
      db.cards,
      db.lessonCards,
      db.assets,
      db.courseAssessments,
      db.sequences,
      db.occlusions,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.concepts,
      db.questions,
      db.questionConcepts,
      db.questionSets,
      db.practiceNodes,
      db.tombstones,
    ],
    async () => {
      // Pre-compute fresh ids for every incoming sequence and sequence item before any
      // lesson card is created, so a shared card's `si` reference (which is set while
      // walking `shareLesson.cards` below) can be remapped to the new item id straight
      // away. The sequence rows themselves are only inserted once every lesson (hence
      // lessonIds, needed for `primaryLessonId`) exists — see the loop after exams.
      const sequenceIdMap = new Map<string, string>();
      const itemIdMap = new Map<string, string>();
      const generatedConceptIdMap = new Map<string, string>();
      for (const shareSeq of payload.sequences ?? []) {
        const sequenceId = makeId();
        sequenceIdMap.set(shareSeq.id, sequenceId);
        for (const item of shareSeq.items) {
          const itemId = makeId();
          itemIdMap.set(item.id, itemId);
          generatedConceptIdMap.set(
            conceptIdForSequenceItem(shareSeq.id, item.id),
            conceptIdForSequenceItem(sequenceId, itemId),
          );
        }
      }
      const remapSequenceItemId = (si: string): string | undefined => {
        const { baseId, isLabel } = splitSequenceItemId(si);
        const mapped = itemIdMap.get(baseId);
        if (!mapped) return undefined;
        return isLabel ? `${mapped}${LABEL_CARD_SUFFIX}` : mapped;
      };

      // Same pre-computation for occlusion regions: a shared card's `oc` reference is
      // resolved while walking the lessons below, and `pairedRegionId` points at another
      // region in the same occlusion, so every region id must be mapped up front.
      const occlusionIdMap = new Map<string, string>();
      const regionIdMap = new Map<string, string>();
      for (const shareOcc of payload.occlusions ?? []) {
        const occlusionId = makeId();
        occlusionIdMap.set(shareOcc.id, occlusionId);
        for (const region of shareOcc.regions) {
          const regionId = makeId();
          regionIdMap.set(region.id, regionId);
          generatedConceptIdMap.set(
            conceptIdForRegion(shareOcc.id, region.id),
            conceptIdForRegion(occlusionId, regionId),
          );
        }
      }

      const course = await createCourse(payload.course.n || 'Shared course', {
        description: payload.course.d ?? '',
        ...(typeof payload.by === 'string' ? { creator: payload.by } : {}),
        ...(payload.course.specificationRef === undefined
          ? {}
          : { specificationRef: payload.course.specificationRef }),
        ...(payload.course.specificationData === undefined
          ? {}
          : { specificationData: payload.course.specificationData }),
        ...(payload.course.examBoard === undefined ? {} : { examBoard: payload.course.examBoard }),
        ...(payload.course.specification === undefined
          ? {}
          : { specification: payload.course.specification }),
        examObjective: payload.course.o === 1 ? 'securedTopics' : 'expectedMarks',
        createdAt: payload.course.c,
        schedulingMode: payload.course.sm === 1 ? 'steady' : 'exam',
        ...(payload.course.e === undefined ? {} : { examDate: payload.course.e }),
        fsrsParameters: {
          ...defaultFsrsParameters(),
          ...(typeof payload.course.r === 'number'
            ? { requestRetention: clampRequestRetention(payload.course.r) }
            : {}),
        },
        ...(payload.course.p && payload.course.p > 0 ? { newCardsPerDay: payload.course.p } : {}),
        ...(payload.course.lf === 0 ? { learnFirst: false } : {}),
        ...(payload.course.l ? { colour: payload.course.l } : {}),
        unlockMode: payload.course.um,
        // Imported courses default to study (read-only) mode regardless of the
        // sharer's own setting — the share payload never packs lessonViewMode.
        lessonViewMode: 'study',
      });
      importedCourseId = course.id;

      const importedAt = Date.now();
      const conceptIdMap = new Map<string, string>();
      if (payload.v !== 2) {
        const importedConcepts: Concept[] = payload.concepts.map((concept, index) => {
          // Keep native generator identities reproducible after remapping, including
          // when every Card for an item/region is removed and later regenerated.
          // All presentations and Question relationships use this same per-Concept map.
          const id = generatedConceptIdMap.get(concept.id) ?? makeId();
          conceptIdMap.set(concept.id, id);
          return {
            id,
            scope: 'course',
            scopeKey: `course:${course.id}`,
            courseId: course.id,
            name: concept.n,
            provisional: concept.p === 1,
            ...(concept.specificationPointIds === undefined
              ? {}
              : { specificationPointIds: concept.specificationPointIds }),
            createdAt: importedAt + index,
            updatedAt: importedAt + index,
          };
        });
        if (importedConcepts.length > 0) await db.concepts.bulkAdd(importedConcepts);
      }
      const lessonIdMap = new Map(
        payload.lessons.flatMap((lesson) => (lesson.i ? [[lesson.i, makeId()] as const] : [])),
      );
      const importedLessons: Lesson[] = payload.lessons.map((shareLesson, orderIndex) => ({
        id: shareLesson.i ? lessonIdMap.get(shareLesson.i)! : makeId(),
        ...(shareLesson.pr
          ? { prerequisiteLessonIds: shareLesson.pr.map((id) => lessonIdMap.get(id)!) }
          : {}),
        courseId: course.id,
        name: shareLesson.n.trim() || 'Untitled lesson',
        orderIndex,
        createdAt: importedAt + orderIndex,
        updatedAt: importedAt + orderIndex,
        ...(shareLesson.d ? { description: shareLesson.d } : {}),
        isExtension: shareLesson.x === 1,
        ...(typeof shareLesson.rd === 'number' ? { releaseDate: shareLesson.rd } : {}),
        ...(typeof shareLesson.ed === 'number' ? { examDate: shareLesson.ed } : {}),
        ...(shareLesson.tz ? { timeZone: shareLesson.tz } : {}),
        ...(shareLesson.sf ? { sessionFilter: shareLesson.sf } : {}),
        ...(shareLesson.am ? { answerMode: shareLesson.am } : {}),
      }));
      if (importedLessons.length > 0) await db.lessons.bulkAdd(importedLessons);
      const lessonIds = importedLessons.map((lesson) => lesson.id);
      const cardIdMap = new Map<string, string>();

      const importedNotes: Note[] = payload.lessons.flatMap((shareLesson, lessonIndex) =>
        shareLesson.notes.map((shareNote, orderIndex) => ({
          id: makeId(),
          lessonId: lessonIds[lessonIndex],
          name: shareNote.n.trim() || 'Untitled note',
          content: shareNote.c,
          orderIndex,
          createdAt: importedAt + orderIndex,
          updatedAt: importedAt + orderIndex,
        })),
      );
      if (importedNotes.length > 0) await db.notes.bulkAdd(importedNotes);

      for (let lessonIndex = 0; lessonIndex < payload.lessons.length; lessonIndex++) {
        const shareLesson = payload.lessons[lessonIndex];
        const lessonId = lessonIds[lessonIndex];
        const drafts = shareLesson.cards.flatMap((shareCard) =>
          unpackCard(shareCard).map((draft) => ({
            draft: {
              ...draft,
              ...(payload.v !== 2 ? { conceptId: conceptIdMap.get(shareCard.co ?? '') } : {}),
            },
            sequenceItemId: shareCard.si,
            occlusionRegionId: shareCard.oc,
            sourceCardId: shareCard.id,
          })),
        );
        if (payload.v !== 2 && drafts.some(({ draft }) => !draft.conceptId)) {
          throw new Error('A shared Card references a missing Concept.');
        }
        if (drafts.length === 0) continue;
        const deckId = await ensureLessonBackingDeck(course.id, lessonId);
        const created = await createCards(
          deckId,
          drafts.map(({ draft }) => draft),
          { courseId: course.id, primaryLessonId: lessonId },
        );
        const generatedCards = created.flatMap<Card>((card, index) => {
          const sourceCardId = drafts[index].sourceCardId;
          if (sourceCardId && !cardIdMap.has(sourceCardId)) cardIdMap.set(sourceCardId, card.id);
          const { sequenceItemId, occlusionRegionId } = drafts[index];
          if (sequenceItemId) {
            const remapped = remapSequenceItemId(sequenceItemId);
            return remapped ? [{ ...card, sequenceItemId: remapped }] : [];
          }
          if (occlusionRegionId) {
            const remapped = regionIdMap.get(occlusionRegionId);
            return remapped ? [{ ...card, occlusionRegionId: remapped }] : [];
          }
          return [];
        });
        if (generatedCards.length > 0) await db.cards.bulkPut(generatedCards);
        cardCount += created.length;
      }

      const bankDrafts = (payload.bankCards ?? []).flatMap((shareCard) =>
        unpackCard(shareCard).map((draft) => ({
          draft: {
            ...draft,
            ...(payload.v !== 2 ? { conceptId: conceptIdMap.get(shareCard.co ?? '') } : {}),
          },
          sourceCardId: shareCard.id,
        })),
      );
      if (payload.v !== 2 && bankDrafts.some(({ draft }) => !draft.conceptId)) {
        throw new Error('A shared Card references a missing Concept.');
      }
      if (bankDrafts.length > 0) {
        const bankDeckId = await ensureCourseBankBackingDeck(course.id);
        const created = await createCards(
          bankDeckId,
          bankDrafts.map(({ draft }) => draft),
          { courseId: course.id, primaryLessonId: null },
        );
        created.forEach((card, index) => {
          const sourceCardId = bankDrafts[index].sourceCardId;
          if (sourceCardId && !cardIdMap.has(sourceCardId)) cardIdMap.set(sourceCardId, card.id);
        });
        cardCount += created.length;
      }

      const importedLinks: LessonCardLink[] = (payload.links ?? []).flatMap((link) => {
        const lessonId = lessonIds[link.l];
        const cardId = cardIdMap.get(link.c);
        return lessonId && cardId
          ? [{ id: makeId(), lessonId, cardId, createdAt: importedAt, updatedAt: importedAt }]
          : [];
      });
      if (importedLinks.length > 0) await db.lessonCards.bulkAdd(importedLinks);

      const fullAssessmentPayload = (payload.exams ?? []).some(
        (assessment) => assessment.id !== undefined || assessment.k !== undefined,
      );
      if (
        fullAssessmentPayload &&
        (payload.exams ?? []).filter((assessment) => assessment.k === 'f').length !== 1
      ) {
        throw new Error('A shared course must contain exactly one final assessment.');
      }
      const importedAssessments: CourseAssessment[] = (payload.exams ?? []).map(
        (shareExam, index) => {
          const coveredLessonIds = (shareExam.ls ?? [])
            .map((lessonIndex) => lessonIds[lessonIndex])
            .filter((id): id is string => !!id);
          const afterLessonId = fullAssessmentPayload
            ? shareExam.a === null
              ? null
              : typeof shareExam.a === 'number'
                ? (lessonIds[shareExam.a] ?? null)
                : null
            : coveredLessonIds.length > 0
              ? ([...importedLessons]
                  .reverse()
                  .find((lesson) => coveredLessonIds.includes(lesson.id))?.id ?? null)
              : (lessonIds[lessonIds.length - 1] ?? null);
          const common = {
            id: shareExam.id ?? makeId(),
            courseId: course.id,
            name: shareExam.n || 'Exam',
            kind: shareExam.k === 'f' ? ('final' as const) : ('checkpoint' as const),
            ...(shareExam.e === undefined ? {} : { examDate: shareExam.e }),
            ...(shareExam.sm === 1 ? { schedulingMode: 'steady' as const } : {}),
            createdAt: shareExam.c ?? importedAt + index,
            updatedAt: shareExam.c ?? importedAt + index,
            afterLessonId,
            excludedCardIds: (shareExam.x ?? [])
              .map((id) => cardIdMap.get(id))
              .filter((id): id is string => id !== undefined),
            ...(shareExam.ac ? { needsAuthorConfirmation: true } : {}),
            ...(shareExam.tz ? { timeZone: shareExam.tz } : {}),
          };
          if (shareExam.m === 's')
            return {
              ...common,
              coverageMode: 'specification' as const,
              ...(shareExam.specificationPaperId !== undefined
                ? { specificationPaperId: shareExam.specificationPaperId }
                : { specificationPointIds: shareExam.specificationPointIds! }),
            };
          return shareExam.m === 'c' || (!fullAssessmentPayload && coveredLessonIds.length > 0)
            ? { ...common, coverageMode: 'custom' as const, lessonIds: coveredLessonIds }
            : { ...common, coverageMode: 'prefix' as const };
        },
      );
      if (importedAssessments.length > 0) {
        if (fullAssessmentPayload) {
          await db.courseAssessments.where('courseId').equals(course.id).delete();
          for (const assessment of importedAssessments) {
            if (await db.courseAssessments.get(assessment.id)) assessment.id = makeId();
          }
        }
        await db.courseAssessments.bulkAdd(importedAssessments);
        await syncCourseSchedulingUnits(course.id);
      }
      const assessmentIdMap = new Map<string, string>();
      (payload.exams ?? []).forEach((exam, index) => {
        if (exam.id) assessmentIdMap.set(exam.id, importedAssessments[index].id);
      });

      // Insert the sequences themselves once lessonIds is complete (for primaryLessonId)
      // and their generated cards already exist with remapped sequenceItemIds. Inserted
      // directly rather than via createSequence, which would generate a duplicate set of
      // cards — the shared cards already carry the sequence's generated content.
      const importedSequences = planSharedSequences({
        payload,
        courseId: course.id,
        lessonIds,
        importedAt,
        sequenceIdMap,
        itemIdMap,
      });
      if (importedSequences.length > 0) await db.sequences.bulkAdd(importedSequences);

      // Occlusions insert on the same terms as sequences: after lessonIds exists (for
      // primaryLessonId) and after their generated cards already carry remapped region
      // ids, and directly rather than through createOcclusion, which would generate a
      // second set of cards. Course files supply the referenced asset; text codes
      // omit it, so their study face falls back to plain-text front/back.
      const importedOcclusions = planSharedOcclusions({
        payload,
        courseId: course.id,
        lessonIds,
        importedAt,
        occlusionIdMap,
        regionIdMap,
        conceptIdMap,
      });
      if (importedOcclusions.length > 0) await db.occlusions.bulkAdd(importedOcclusions);

      if (payload.v !== 2) {
        const importedQuestions: QuestionDefinition[] = [];
        const importedQuestionConcepts: QuestionConceptSet[] = [];
        for (let index = 0; index < payload.questions.length; index += 1) {
          const shared = payload.questions[index];
          const targetConceptId = conceptIdMap.get(shared.t);
          const prerequisiteConceptIds = shared.pr.map((id) => conceptIdMap.get(id));
          if (!targetConceptId || prerequisiteConceptIds.some((id) => id === undefined)) {
            throw new Error('A shared Question references a missing Concept.');
          }
          const id = makeId();
          const now = importedAt + index;
          const authoringRevisionId = makeId();
          const common = {
            id,
            courseId: course.id,
            primaryLessonId: shared.pl === undefined ? null : (lessonIds[shared.pl] ?? null),
            additionalLessonIds: (shared.al ?? [])
              .map((lessonIndex) => lessonIds[lessonIndex])
              .filter((lessonId): lessonId is string => lessonId !== undefined),
            name: shared.n,
            tags: shared.g ?? [],
            contentVersion: 1,
            contentRevisionId: makeId(),
            authoringRevisionId,
            authoringUpdatedAt: now,
            ...emptyQuestionSchedule(),
            scheduleEpoch: {
              id: makeId(),
              startedAt: now,
              reason: 'created' as const,
              baseline: { kind: 'new' as const },
            },
            scheduleUpdatedAt: now,
            createdAt: now,
            updatedAt: now,
          };
          importedQuestions.push(
            shared.k === 0
              ? {
                  ...common,
                  kind: 'fixed',
                  suspended: shared.s === 1,
                  prompt: shared.f,
                  payload: shared.p,
                  explanation: shared.e,
                  explanationStatus: shared.ld === 1 ? 'legacy-derived' : 'authored',
                }
              : {
                  ...common,
                  kind: 'generated',
                  suspended:
                    shared.s === 1 ||
                    questionGeneratorRegistry.describe(shared.gk, shared.gv) === undefined,
                  generatorKey: shared.gk,
                  generatorVersion: shared.gv,
                  generatorConfig: shared.gc,
                },
          );
          importedQuestionConcepts.push({
            questionId: id,
            courseId: course.id,
            targetConceptIds: [targetConceptId],
            prerequisiteConceptIds: prerequisiteConceptIds as string[],
            authoringRevisionId,
            authoringUpdatedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
        if (importedQuestions.length > 0) await db.questions.bulkAdd(importedQuestions);
        if (importedQuestionConcepts.length > 0) {
          await db.questionConcepts.bulkAdd(importedQuestionConcepts);
        }
      }
      if (payload.v === 4 || payload.v === 5 || payload.v === 6) {
        const importedSets = importSharedQuestionSets({
          records: payload.questionSets,
          sharedLessons: payload.lessons,
          lessonIds,
          courseId: course.id,
          conceptIdMap,
          assessmentIdMap,
          importedAt,
          makeId,
        });
        if (importedSets.length > 0) await db.questionSets.bulkAdd(importedSets);
        if (payload.v === 5 || payload.v === 6) {
          const importedSetIds = new Map(
            payload.questionSets.map((set, index) => [set.id, importedSets[index].id]),
          );
          const importedLessonIds = new Map(
            payload.lessons.map((lesson, index) => [lesson.i, lessonIds[index]]),
          );
          const importedNodes = payload.questionSetPracticeNodes.map((node) => {
            const questionSetIds = node.questionSetIds.map((id) => {
              const mapped = importedSetIds.get(id);
              if (!mapped)
                throw new Error(
                  `A shared Question Set activity references an unmapped Set: ${id}.`,
                );
              return mapped;
            });
            const afterLessonId = importedLessonIds.get(node.afterLessonId);
            if (!afterLessonId) {
              throw new Error('A shared Question Set activity has a missing Set or Lesson.');
            }
            return parseQuestionSetPracticeNode({
              ...node,
              id: makeId(),
              courseId: course.id,
              questionSetIds,
              afterLessonId,
              createdAt: importedAt,
              updatedAt: importedAt,
            });
          });
          if (importedNodes.length > 0) await db.practiceNodes.bulkAdd(importedNodes);
        }
      }
      if (scheduling) await applyImportedCourseScheduling(course.id, scheduling);
    },
  );

  if (!importedCourseId) throw new Error('The shared course could not be created.');
  return {
    courses: 1,
    lessons: payload.lessons.length,
    cards: cardCount,
    questions: payload.v !== 2 ? payload.questions.length : 0,
    courseIds: [importedCourseId],
  };
}

/**
 * Import a decoded share payload into the course model. Imported content is always
 * new (sharing never overwrites existing data). A course payload recreates its course
 * directly. A v1 deck payload is refused. All FSRS/review state starts clean for
 * the new owner.
 */
export async function importSharePayload(
  payload: SharePayload,
  scheduling?: ImportCourseScheduling,
): Promise<ImportShareResult> {
  if (payload.v !== 6) {
    throw new Error(V1_SHARE_CODE_MESSAGE);
  }
  return importCourseSharePayload(payload, scheduling);
}
