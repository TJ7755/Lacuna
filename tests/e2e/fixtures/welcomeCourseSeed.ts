import { decodeCourseFile, withCourseFileAssets } from '../../../apps/web/src/db/courseFile';
import { db } from '../../../apps/web/src/db/schema';
import { importSharePayload } from '../../../apps/web/src/db/shareCourseImport';
import { getLocalTimeZone } from '../../../apps/web/src/utils/datetime';

export async function seed(text: string, examDate: number) {
  try {
    if ((await db.courses.count()) !== 0)
      throw new Error('Welcome course setup needs a fresh database.');
    const file = await decodeCourseFile(text);
    await withCourseFileAssets(file, () =>
      importSharePayload(file.payload, {
        schedulingMode: 'exam',
        examDate,
        timeZone: getLocalTimeZone(),
      }),
    );
  } finally {
    db.close();
  }
}
