import { z } from 'zod';
import Dexie from 'dexie';
import { db } from './schema';
import {
  buildCourseSharePayload,
  parseSharePayload,
  type SharePayloadV2,
  type SharePayloadV3,
} from './share';
import {
  assetsForBackup,
  backupAssetToMediaAsset,
  referencedAssetHashesInValues,
  sha256Blob,
  toBlob,
} from './assets';
import type { BackupAsset, MediaAsset } from './types';

export const MAX_COURSE_FILE_BYTES = 100 * 1024 * 1024;

const CourseFileSchema = z.object({
  format: z.literal('lacuna-course'),
  version: z.literal(1),
  payload: z.unknown(),
  assets: z.array(
    z.object({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      data: z.string(),
      mimeType: z.string().regex(/^(image|audio)\/[a-z0-9.+-]+$/i),
      kind: z.enum(['image', 'audio']).optional(),
      width: z.number().finite().nonnegative().optional(),
      height: z.number().finite().nonnegative().optional(),
      createdAt: z.number().finite(),
    }),
  ),
});

export interface CourseFile {
  format: 'lacuna-course';
  version: 1;
  payload: SharePayloadV2 | SharePayloadV3;
  assets: BackupAsset[];
}

function requiredAssets(payload: CourseFile['payload']): Set<string> {
  return new Set([
    ...referencedAssetHashesInValues(payload),
    ...(payload.occlusions ?? []).map((occlusion) => occlusion.ah),
  ]);
}

function assertComplete(file: CourseFile): void {
  const required = requiredAssets(file.payload);
  const supplied = new Set(file.assets.map((asset) => asset.hash));
  if (supplied.size !== file.assets.length)
    throw new Error('The course file contains duplicate media.');
  if ([...required].some((hash) => !supplied.has(hash))) {
    throw new Error('The course contains missing media. Restore the missing files before sharing.');
  }
  if ([...supplied].some((hash) => !required.has(hash))) {
    throw new Error('The course file contains unrelated media.');
  }
}

/** Share the existing course content with its referenced media, never learner history. */
export async function buildCourseFile(courseId: string): Promise<string> {
  const file = await db.transaction('r', db.tables, async (): Promise<CourseFile> => {
    const payload = await buildCourseSharePayload(courseId, { includeMedia: true });
    const assets = await Dexie.waitFor(assetsForBackup([...requiredAssets(payload)]));
    return { format: 'lacuna-course', version: 1, payload, assets };
  });
  assertComplete(file);
  const text = JSON.stringify(file);
  if (new Blob([text]).size > MAX_COURSE_FILE_BYTES) {
    throw new Error('The course file exceeds the 100 MB limit.');
  }
  return text;
}

async function validatedAssets(file: CourseFile): Promise<MediaAsset[]> {
  assertComplete(file);
  const assets: MediaAsset[] = [];
  // Hash sequentially to keep temporary hashing buffers bounded.
  for (const asset of file.assets) {
    const media = backupAssetToMediaAsset(asset);
    if ((await sha256Blob(toBlob(media.blob, media.mimeType))) !== asset.hash) {
      throw new Error('The course file contains corrupt media.');
    }
    assets.push(media);
  }
  return assets;
}

export async function decodeCourseFile(text: string): Promise<CourseFile> {
  if (new Blob([text]).size > MAX_COURSE_FILE_BYTES) {
    throw new Error('The course file exceeds the 100 MB limit.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid Lacuna course file.');
  }
  const parsed = CourseFileSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('This course file is invalid or uses an unsupported version.');
  const payload = parseSharePayload(parsed.data.payload);
  if (payload.v === 1) throw new Error('This course file uses an unsupported version.');
  const file: CourseFile = { ...parsed.data, payload };
  await validatedAssets(file);
  return file;
}

/** Keep media and the existing new-course/lineage importer in the same transaction. */
export async function withCourseFileAssets<T>(
  file: CourseFile,
  importContent: () => Promise<T>,
): Promise<T> {
  const assets = await validatedAssets(file);
  return db.transaction('rw', db.tables, async () => {
    const existing = await db.assets.bulkGet(assets.map((asset) => asset.hash));
    await db.assets.bulkAdd(assets.filter((_, index) => !existing[index]));
    return importContent();
  });
}
