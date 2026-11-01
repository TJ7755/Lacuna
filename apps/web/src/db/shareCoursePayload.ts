import { db } from './schema';
import { assertLessonPrerequisites } from './lessonPrerequisites';
import {
  assertQuestionSetPracticeNodeReferences,
  parseQuestionSetPracticeNode,
} from './questionSetPracticeNode';
import { finalAssessmentForCourse } from './assessmentMigration';
import { stripAssetMedia } from './assets';
import { presetForSequence } from './sequencePresets';
import { packQuestionSetMedia } from '../questions/questionSetShare';
import type { Card, Note } from '@lacuna/core/db/types';
import type {
  ShareCard,
  ShareNote,
  ShareLesson,
  ShareCourse,
  ShareExam,
  ShareSequence,
  ShareOcclusion,
  ShareQuestion,
  SharePayloadV6,
} from './sharePayload';

function packMedia(
  markdown: string,
  includeMedia: boolean,
): { markdown: string; stripped: boolean } {
  return includeMedia ? { markdown, stripped: false } : stripAssetMedia(markdown);
}

/**
 * Pack a deck's cards, folding each front/back card that has an exact mirror into a
 * single reversible entry. Cloze cards pass through untouched.
 */
function packCards(cards: Card[], preserveIds = false, includeMedia = false): ShareCard[] {
  const out: ShareCard[] = [];
  const consumed = new Set<string>();
  // Use a length-prefixed key so the separator can never collide with card content.
  // Format: length-of-front + \u0002 + front + \u0002 + back.  \u0002 is a control
  // character that cannot appear in normal Markdown.
  const key = (f: string, b: string) => `${f.length}${f}${b}`;

  // Index front/back cards by content so a card can find its mirror in one lookup.
  const byContent = new Map<string, Card[]>();
  for (const c of cards) {
    if (c.type !== 'front_back') continue;
    const k = key(c.front, c.back);
    const bucket = byContent.get(k);
    if (bucket) bucket.push(c);
    else byContent.set(k, [c]);
  }

  for (const c of cards) {
    if (consumed.has(c.id)) continue;
    const tags = c.tags && c.tags.length ? { g: c.tags } : {};
    const front = packMedia(c.front, includeMedia);
    const back = packMedia(c.back, includeMedia);
    // The compact `i` field predates audio and remains unchanged for share-code compatibility.
    const mediaFlag = front.stripped || back.stripped ? { i: 1 as const } : {};
    const seqRef = c.sequenceItemId ? { si: c.sequenceItemId } : {};
    const occRef = c.occlusionRegionId ? { oc: c.occlusionRegionId } : {};
    const payload = c.payload ? { p: c.payload } : {};
    const identity = preserveIds ? { id: c.id } : {};
    const metadata = { co: c.conceptId, ...(c.answerMode ? { am: c.answerMode } : {}) };

    if (c.type === 'cloze') {
      out.push({
        k: 1,
        f: front.markdown,
        ...tags,
        ...mediaFlag,
        ...seqRef,
        ...occRef,
        ...payload,
        ...identity,
        ...metadata,
      });
      consumed.add(c.id);
      continue;
    }

    if (c.sequenceItemId || c.occlusionRegionId || c.payload) {
      // Generated and structured-item cards never fold into reversible pairs: their
      // metadata belongs to exactly one card and cannot be copied to its mirror.
      out.push({
        k: 0,
        f: front.markdown,
        b: back.markdown,
        ...tags,
        ...mediaFlag,
        ...seqRef,
        ...occRef,
        ...payload,
        ...identity,
        ...metadata,
      });
      consumed.add(c.id);
      continue;
    }

    const partner =
      !preserveIds &&
      (byContent.get(key(c.back, c.front)) ?? []).find(
        (p) => p.id !== c.id && !consumed.has(p.id) && p.answerMode === c.answerMode,
      );
    if (partner) {
      out.push({ k: 2, f: front.markdown, b: back.markdown, ...tags, ...mediaFlag, ...metadata });
      consumed.add(c.id);
      consumed.add(partner.id);
    } else {
      out.push({
        k: 0,
        f: front.markdown,
        b: back.markdown,
        ...tags,
        ...mediaFlag,
        ...identity,
        ...metadata,
      });
      consumed.add(c.id);
    }
  }
  return out;
}

/**
 * Pack a lesson's notes with the same media policy as card content.
 * `withOriginatingIds` packs each note's local id as `oi` — only meaningful (and
 * only ever passed) when the exporting course has published, so a plain course
 * export is unaffected.
 */
function packNotes(
  notes: { id: string; name: string; content: string }[],
  withOriginatingIds = false,
  includeMedia = false,
): ShareNote[] {
  return notes.map((n) => {
    const content = packMedia(n.content, includeMedia);
    return {
      n: n.name,
      c: content.markdown,
      ...(content.stripped ? { i: 1 as const } : {}),
      ...(withOriginatingIds ? { oi: n.id } : {}),
    };
  });
}

/** Pack a whole course, including Concepts, Questions and authored Question Sets. */
export async function buildCourseSharePayload(
  courseId: string,
  { includeMedia = false }: { includeMedia?: boolean } = {},
): Promise<SharePayloadV6> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('Course not found.');

  const lessons = await db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
  assertLessonPrerequisites(lessons);
  const hasPrerequisites = lessons.some((lesson) => lesson.prerequisiteLessonIds?.length);
  const lessonIndexById = new Map(lessons.map((l, i) => [l.id, i]));
  const lessonIds = lessons.map((lesson) => lesson.id);
  const [
    notes,
    courseCards,
    lessonLinks,
    concepts,
    questions,
    questionConcepts,
    questionSets,
    practiceNodes,
  ] = await Promise.all([
    lessonIds.length > 0 ? db.notes.where('lessonId').anyOf(lessonIds).toArray() : [],
    db.cards.where('courseId').equals(courseId).toArray(),
    lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
    db.concepts.where('courseId').equals(courseId).toArray(),
    db.questions.where('courseId').equals(courseId).toArray(),
    db.questionConcepts.where('courseId').equals(courseId).toArray(),
    db.questionSets.where('courseId').equals(courseId).toArray(),
    db.practiceNodes.where('courseId').equals(courseId).toArray(),
  ]);
  const notesByLesson = new Map<string, Note[]>();
  for (const note of notes) {
    const group = notesByLesson.get(note.lessonId);
    if (group) group.push(note);
    else notesByLesson.set(note.lessonId, [note]);
  }
  const cardsByLesson = new Map<string, Card[]>();
  for (const card of courseCards) {
    if (!card.primaryLessonId) continue;
    const group = cardsByLesson.get(card.primaryLessonId);
    if (group) group.push(card);
    else cardsByLesson.set(card.primaryLessonId, [card]);
  }
  for (const group of notesByLesson.values()) group.sort((a, b) => a.orderIndex - b.orderIndex);
  for (const group of cardsByLesson.values()) group.sort((a, b) => a.createdAt - b.createdAt);

  // Lesson ids also scope advisory prerequisites and Question Set links in ordinary exports.
  // Only lineage imports adopt them; ordinary imports always mint fresh local ids.
  const distribution = course.distribution;

  const shareLessons: ShareLesson[] = lessons.map((lesson) => {
    return {
      n: lesson.name,
      ...(lesson.prerequisiteLessonIds?.length ? { pr: [...lesson.prerequisiteLessonIds] } : {}),
      ...(lesson.description ? { d: lesson.description } : {}),
      ...(lesson.isExtension ? { x: 1 as const } : {}),
      ...(typeof lesson.releaseDate === 'number' ? { rd: lesson.releaseDate } : {}),
      ...(typeof lesson.examDate === 'number' ? { ed: lesson.examDate } : {}),
      ...(lesson.timeZone ? { tz: lesson.timeZone } : {}),
      ...(lesson.sessionFilter && lesson.sessionFilter !== 'new'
        ? { sf: lesson.sessionFilter }
        : {}),
      ...(lesson.answerMode ? { am: lesson.answerMode } : {}),
      notes: packNotes(notesByLesson.get(lesson.id) ?? [], !!distribution, includeMedia),
      cards: packCards(cardsByLesson.get(lesson.id) ?? [], true, includeMedia),
      ...(distribution || questionSets.length > 0 || hasPrerequisites ? { i: lesson.id } : {}),
    };
  });

  const assessments = await db.courseAssessments
    .where('courseId')
    .equals(courseId)
    .sortBy('examDate');
  const finalAssessment = finalAssessmentForCourse(courseId, assessments);
  const shareExams: ShareExam[] = assessments.map((assessment) => {
    const ls = (assessment.coverageMode === 'custom' ? assessment.lessonIds : [])
      .map((id) => lessonIndexById.get(id))
      .filter((i): i is number => i !== undefined);
    return {
      id: assessment.id,
      n: assessment.name,
      ...(assessment.examDate === undefined ? {} : { e: assessment.examDate }),
      ...(assessment.schedulingMode === 'steady' ? { sm: 1 as const } : {}),
      ...(assessment.timeZone ? { tz: assessment.timeZone } : {}),
      k: assessment.kind === 'final' ? 'f' : 'c',
      a:
        assessment.afterLessonId === null
          ? null
          : (lessonIndexById.get(assessment.afterLessonId) ?? null),
      m:
        assessment.coverageMode === 'specification'
          ? 's'
          : assessment.coverageMode === 'custom'
            ? 'c'
            : 'p',
      ...(assessment.coverageMode === 'specification'
        ? {
            ...(assessment.specificationPaperId === undefined
              ? {}
              : { specificationPaperId: assessment.specificationPaperId }),
            ...(assessment.specificationPointIds === undefined
              ? {}
              : { specificationPointIds: assessment.specificationPointIds }),
          }
        : {}),
      ...(assessment.coverageMode === 'custom' ? { ls } : {}),
      ...(assessment.excludedCardIds.length ? { x: assessment.excludedCardIds } : {}),
      ...(assessment.needsAuthorConfirmation ? { ac: 1 as const } : {}),
      c: assessment.createdAt,
    };
  });

  const shareCourse: ShareCourse = {
    n: course.name,
    ...(course.description ? { d: course.description } : {}),
    ...(course.specificationRef === undefined ? {} : { specificationRef: course.specificationRef }),
    ...(course.specificationData === undefined
      ? {}
      : { specificationData: course.specificationData }),
    ...(course.examBoard === undefined ? {} : { examBoard: course.examBoard }),
    ...(course.specification === undefined ? {} : { specification: course.specification }),
    o: course.examObjective === 'securedTopics' ? 1 : 0,
    c: course.createdAt,
    ...(finalAssessment.examDate === undefined ? {} : { e: finalAssessment.examDate }),
    ...(finalAssessment.schedulingMode === 'steady' ? { sm: 1 as const } : {}),
    r: course.fsrsParameters.requestRetention,
    ...(course.newCardsPerDay ? { p: course.newCardsPerDay } : {}),
    ...(course.learnFirst === false ? { lf: 0 as const } : {}),
    ...(course.colour ? { l: course.colour } : {}),
    um: course.unlockMode,
  };
  const linkedCardIds = new Set(lessonLinks.map((link) => link.cardId));
  const bankCards = courseCards.filter(
    (card) => card.primaryLessonId === null && linkedCardIds.has(card.id),
  );
  const knownCardIds = new Set(courseCards.map((card) => card.id));
  const shareLinks = lessonLinks.flatMap((link) => {
    const lessonIndex = lessonIndexById.get(link.lessonId);
    return lessonIndex === undefined || !knownCardIds.has(link.cardId)
      ? []
      : [{ l: lessonIndex, c: link.cardId }];
  });

  // Bank-scoped sequences remain excluded: a share carries taught lesson material,
  // not unassigned sequence authoring state.
  const sequences = (
    await db.sequences.where('courseId').equals(courseId).sortBy('createdAt')
  ).filter((s) => s.primaryLessonId !== null);
  const shareSequences: ShareSequence[] = sequences.map((s) => {
    const pl = s.primaryLessonId ? lessonIndexById.get(s.primaryLessonId) : undefined;
    return {
      id: s.id,
      n: s.name,
      ...(s.description ? { d: s.description } : {}),
      items: s.items.map((item) => ({
        id: item.id,
        v: item.value,
        ...(item.label ? { l: item.label } : {}),
        ...(item.chunkIndex !== undefined ? { ci: item.chunkIndex } : {}),
        ...(item.speaker ? { sp: item.speaker } : {}),
      })),
      cw: s.cueWindow,
      ...(s.chunkLabels && s.chunkLabels.length ? { cl: s.chunkLabels } : {}),
      ...(s.generateLabelCards ? { lc: 1 as const } : {}),
      ...(pl !== undefined ? { pl } : {}),
      ...(s.mode === 'lines' ? { m: 'lines' as const } : {}),
      ...(s.mySpeaker ? { ms: s.mySpeaker } : {}),
      ...(s.recitationChunkSize !== undefined ? { rc: s.recitationChunkSize } : {}),
      // Only spend payload space on the preset id when the receiving end couldn't
      // re-derive it from m/ms alone (see presetForSequence) — e.g. poetry vs. speech.
      ...(s.presetId &&
      s.presetId !== presetForSequence({ mode: s.mode, mySpeaker: s.mySpeaker }).id
        ? { pr: s.presetId }
        : {}),
    };
  });

  // Bank-scoped occlusions are excluded for the same reason bank-scoped sequences are:
  // a share carries taught lesson material, not unassigned authoring state.
  const occlusions = (
    await db.occlusions.where('courseId').equals(courseId).sortBy('createdAt')
  ).filter((o) => o.primaryLessonId !== null);
  const shareOcclusions: ShareOcclusion[] = occlusions.map((o) => {
    const pl = o.primaryLessonId ? lessonIndexById.get(o.primaryLessonId) : undefined;
    return {
      id: o.id,
      n: o.name,
      ah: o.assetHash,
      ...(o.regionConceptIds
        ? {
            regionConceptIds: Object.fromEntries(
              Object.entries(o.regionConceptIds).filter(([regionId]) =>
                o.regions.some((region) => region.id === regionId),
              ),
            ),
          }
        : {}),
      regions: o.regions.map((region) => ({
        id: region.id,
        r: (region.role === 'feature' ? 1 : 0) as 0 | 1,
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        ...(region.answerText ? { a: region.answerText } : {}),
        ...(region.pairedRegionId ? { p: region.pairedRegionId } : {}),
        ...(region.backNote ? { bn: region.backNote } : {}),
      })),
      ...(pl !== undefined ? { pl } : {}),
    };
  });

  const conceptIds = new Set(concepts.map((concept) => concept.id));
  for (const card of courseCards) {
    if (!conceptIds.has(card.conceptId)) {
      throw new Error(`Card ${card.id} references a missing Concept.`);
    }
  }
  const conceptSetByQuestion = new Map(questionConcepts.map((set) => [set.questionId, set]));
  const shareQuestions: ShareQuestion[] = questions.map((question) => {
    const set = conceptSetByQuestion.get(question.id);
    if (!set || set.targetConceptIds.length !== 1) {
      throw new Error(`Question ${question.id} does not have exactly one primary Concept.`);
    }
    const [targetConceptId] = set.targetConceptIds;
    if (
      !conceptIds.has(targetConceptId) ||
      set.prerequisiteConceptIds.some((conceptId) => !conceptIds.has(conceptId))
    ) {
      throw new Error(`Question ${question.id} references a missing Concept.`);
    }
    const primaryLessonIndex = question.primaryLessonId
      ? lessonIndexById.get(question.primaryLessonId)
      : undefined;
    const additionalLessonIndices = question.additionalLessonIds
      .map((lessonId) => lessonIndexById.get(lessonId))
      .filter((index): index is number => index !== undefined);
    const common = {
      id: question.id,
      n: question.name,
      ...(primaryLessonIndex === undefined ? {} : { pl: primaryLessonIndex }),
      ...(additionalLessonIndices.length === 0 ? {} : { al: additionalLessonIndices }),
      ...(question.tags.length === 0 ? {} : { g: question.tags }),
      ...(question.suspended ? { s: 1 as const } : {}),
      t: targetConceptId,
      pr: set.prerequisiteConceptIds,
    };
    if (question.kind === 'generated') {
      return {
        ...common,
        k: 1 as const,
        gk: question.generatorKey,
        gv: question.generatorVersion,
        gc: question.generatorConfig,
      };
    }
    const prompt = packMedia(question.prompt, includeMedia);
    const explanation = packMedia(question.explanation, includeMedia);
    return {
      ...common,
      k: 0 as const,
      f: prompt.markdown,
      p: question.payload,
      e: explanation.markdown,
      ...(question.explanationStatus === 'legacy-derived' ? { ld: 1 as const } : {}),
      ...(prompt.stripped || explanation.stripped ? { i: 1 as const } : {}),
    };
  });

  const questionSetPracticeNodes = practiceNodes.filter((node) => node.type === 'question-set');
  assertQuestionSetPracticeNodeReferences(
    questionSetPracticeNodes,
    [course],
    lessons,
    questionSets,
  );
  return {
    v: 6,
    by: course.creator ?? null,
    at: Date.now(),
    course: shareCourse,
    lessons: shareLessons,
    ...(shareExams.length ? { exams: shareExams } : {}),
    ...(bankCards.length ? { bankCards: packCards(bankCards, true, includeMedia) } : {}),
    ...(shareLinks.length ? { links: shareLinks } : {}),
    ...(shareSequences.length ? { sequences: shareSequences } : {}),
    ...(shareOcclusions.length ? { occlusions: shareOcclusions } : {}),
    concepts: concepts.map((concept) => ({
      id: concept.id,
      n: concept.name,
      ...(concept.provisional ? { p: 1 as const } : {}),
      ...(concept.specificationPointIds === undefined
        ? {}
        : { specificationPointIds: concept.specificationPointIds }),
    })),
    questions: shareQuestions,
    questionSets: questionSets.map((record) => packQuestionSetMedia(record, includeMedia)),
    questionSetPracticeNodes: questionSetPracticeNodes.map(parseQuestionSetPracticeNode),
    ...(distribution ? { li: distribution.lineageId, rv: distribution.revision } : {}),
  };
}
