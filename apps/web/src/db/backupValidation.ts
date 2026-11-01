import { z } from 'zod';
import { assertSpecificationAssessmentReferences } from '../specifications/assessment';
import { assertLessonPrerequisites } from './lessonPrerequisites';
import type { BackupFile, Lesson } from '@lacuna/core/db/types';
import { recordSchemas } from './backupRecordSchemas';
import { stateSchemas } from './backupStateSchemas';

const collections = { ...recordSchemas, ...stateSchemas } satisfies Record<
  Exclude<keyof BackupFile, 'app' | 'version' | 'exportedAt' | 'decks' | 'folders'>,
  z.ZodType
>;
const optionalCollections = Object.fromEntries(
  Object.entries(collections).map(([key, schema]) => [key, z.array(schema).optional()]),
);

// Loose objects retain additive metadata in current exports.
const backupSchema = z
  .looseObject({
    ...optionalCollections,
    app: z.enum(['lacuna', 'lacuna-v12', 'lacuna-v13', 'lacuna-v14', 'lacuna-v15']),
    version: z.number().int().positive(),
    exportedAt: z.number().finite(),
    decks: z.array(z.looseObject({})).optional(),
    folders: z.array(z.looseObject({})).optional(),
    cards: z.array(recordSchemas.cards),
    assets: z.array(recordSchemas.assets),
    sessionHistory: z.array(recordSchemas.sessionHistory),
    userPerformance: z.array(recordSchemas.userPerformance),
  })
  .superRefine((backup, context) => {
    try {
      assertLessonPrerequisites((backup.lessons ?? []) as Lesson[]);
    } catch (error) {
      context.addIssue({ code: 'custom', path: ['lessons'], message: (error as Error).message });
    }
    const paperBackup = backup as unknown as BackupFile;
    try {
      assertSpecificationAssessmentReferences(
        paperBackup.courses ?? [],
        paperBackup.courseAssessments ?? [],
      );
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['courseAssessments'],
        message: (error as Error).message,
      });
    }
    const require = (key: string, version: number) => {
      if (backup[key] === undefined)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `Required in backup version ${version} or later`,
        });
    };
    if (backup.app !== 'lacuna-v15' || backup.version !== 15)
      context.addIssue({
        code: 'custom',
        path: ['version'],
        message:
          'Unsupported old backup version. Export a new backup from the current Lacuna release',
      });
    for (const key of [
      'schedulingUnits',
      'coursePerformance',
      'schedulingPerformance',
      'concepts',
      'questions',
      'questionConcepts',
      'questionAttempts',
      'questionSets',
      'questionSetAttempts',
      'practiceNodes',
    ])
      require(key, 15);
  });

export function backupIsValid(data: unknown): data is BackupFile {
  return backupSchema.safeParse(data).success;
}

export function assertValidBackup(
  data: unknown,
  message = 'Invalid backup file.',
): asserts data is BackupFile {
  const result = backupSchema.safeParse(data);
  if (result.success) return;
  const issue = result.error.issues[0];
  const path = issue.path.reduce<string>(
    (value, part) =>
      typeof part === 'number' ? `${value}[${part}]` : `${value}${value ? '.' : ''}${String(part)}`,
    '',
  );
  throw new Error(`${message} ${path || 'root'}: ${issue.message}.`);
}
