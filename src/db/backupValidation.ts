import { z } from 'zod';
import type { BackupFile } from './types';
import { recordSchemas } from './backupRecordSchemas';
import { stateSchemas } from './backupStateSchemas';

const collections = { ...recordSchemas, ...stateSchemas } satisfies Record<
  Exclude<keyof BackupFile, 'app' | 'version' | 'exportedAt' | 'decks' | 'folders'>,
  z.ZodType
>;
const optionalCollections = Object.fromEntries(
  Object.entries(collections).map(([key, schema]) => [key, z.array(schema).optional()]),
);

// Loose objects validate known fields whilst retaining additive metadata. Older
// supported exports lack some collections and mutation timestamps; import already
// backfills those. Deck/Folder rows remain subject to the existing pre-v22 refusal.
export const backupSchema = z
  .looseObject({
    ...optionalCollections,
    app: z.enum(['lacuna', 'lacuna-v12', 'lacuna-v13', 'lacuna-v14']),
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
    const require = (key: string, version: number) => {
      if (backup[key] === undefined)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `Required in backup version ${version} or later`,
        });
    };
    // Pre-upgrade migration snapshots of schema v22-v28 were stamped with the
    // database version rather than a backup version.
    const legacyRawSnapshot =
      backup.app === 'lacuna' && backup.version >= 22 && backup.version <= 28;
    // From v12 each version has its own app id, so older builds refuse files they
    // would silently truncate.
    const supported =
      backup.app === 'lacuna'
        ? backup.version <= 11 || legacyRawSnapshot
        : backup.app === `lacuna-v${backup.version}`;
    if (!supported)
      context.addIssue({ code: 'custom', path: ['version'], message: 'Unsupported version' });
    if (backup.version >= 11 && !(legacyRawSnapshot && backup.version < 24))
      for (const key of ['concepts', 'questions', 'questionConcepts', 'questionAttempts'])
        require(key, 11);
    if (backup.version >= 12 && !legacyRawSnapshot) require('questionSets', 12);
    if (backup.version >= 13 && !legacyRawSnapshot) require('questionSetAttempts', 13);
    if (backup.version >= 14 && !legacyRawSnapshot) require('practiceNodes', 14);
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
