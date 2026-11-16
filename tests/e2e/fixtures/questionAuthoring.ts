import Dexie from 'dexie';
import { db } from '../../../apps/web/src/db/schema';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createConcept } from '../../../apps/web/src/questions/repository';
import { newQuestionState, questionDraftKey } from '../../../apps/web/src/pages/questionDraft';
import { saveDraft } from '../../../apps/web/src/utils/drafts';

let releaseWrite: (() => void) | undefined;

export async function seed(withDraft = false) {
  const course = await createCourse('Question authoring');
  const concept = await createConcept(course.id, 'Addition');
  if (withDraft) {
    saveDraft(questionDraftKey(course.id), {
      state: {
        ...newQuestionState(concept.id),
        name: 'Recovered addition',
        prompt: 'Recovered question',
        explanation: 'Two pairs make four.',
        numericAnswer: { kind: 'exact', value: '4' },
      },
      timestamp: Date.now(),
    });
  }
  return { courseId: course.id, conceptId: concept.id };
}

/** Keep a real write pending long enough to exercise the editor's saving state. */
export async function blockWrites() {
  await new Promise<void>((ready, reject) => {
    void db
      .transaction('rw', db.questions, async () => {
        await Dexie.waitFor(
          new Promise<void>((release) => {
            releaseWrite = release;
            ready();
          }),
        );
      })
      .catch(reject);
  });
}

export function releaseWrites() {
  releaseWrite?.();
}

export async function seedTransition() {
  const {
    createFixedQuestion,
    createGeneratedQuestion,
    startQuestionAttempt,
    answerQuestionAttempt,
  } = await import('../../../apps/web/src/questions/repository');
  const course = await createCourse('Migrated question practice');
  await db.courses.update(course.id, { lessonViewMode: 'study' });
  const concept = await createConcept(course.id, 'Addition');
  const now = Date.now() - 86_400_000;
  const question = await createFixedQuestion({
    courseId: course.id,
    targetConceptId: concept.id,
    name: 'Addition application',
    prompt: 'Calculate **3 + 3**.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '6' } },
    explanation: 'Adding three and three gives six.',
    now,
  });
  const old = await startQuestionAttempt({
    questionId: question.id,
    sessionId: 'before-transition',
    now: now + 100,
  });
  await answerQuestionAttempt({
    attemptId: old.id,
    submittedAnswer: '6',
    marksEarned: 1,
    marksAvailable: 1,
    now: now + 200,
  });
  await createGeneratedQuestion({
    courseId: course.id,
    targetConceptId: concept.id,
    name: 'Quadratic practice',
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: {
      minimumRootMagnitude: 1,
      maximumRootMagnitude: 1,
      maximumLeadingCoefficient: 1,
      allowRepeatedRoots: true,
    },
  });
  return { courseId: course.id, questionId: question.id };
}
