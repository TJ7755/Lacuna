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
