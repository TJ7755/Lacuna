import Dexie from 'dexie';
import { db } from '../../../apps/web/src/db/schema';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createConcept } from '../../../apps/web/src/questions/repository';

let releaseWrite: (() => void) | undefined;

export async function seed() {
  const course = await createCourse('Question authoring');
  const concept = await createConcept(course.id, 'Addition');
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
