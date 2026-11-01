import { updateSequence } from './repository';
import { updateOcclusion } from './occlusionRepository';
import type { LineagePayload } from './lineageImportModel';
import type { LineageIdMapping, Occlusion, Sequence } from '@lacuna/core/db/types';

/**
 * Insert a payload's sequences via `updateSequence`, which already handles both create
 * (an id with no existing row — `db.sequences.put` inserts, and the diff against zero
 * existing generated cards is all-creates) and update (regenerate content-only via
 * `diffRegeneration`) in one call. The sequence's own packed `id` is its originating id,
 * adopted directly exactly like lessons/notes/cards (§7.1) — `buildCourseSharePayload`
 * always packs a sequence's real local id (`share.ts:914-917`), never a payload-scoped
 * placeholder, so there is nothing to remap.
 */
export async function applySequences(
  payload: LineagePayload,
  courseId: string,
  lessonIdByIndex: (index: number) => string | null,
  mapping: LineageIdMapping,
): Promise<void> {
  for (const shareSeq of payload.sequences ?? []) {
    const createdAt = Date.now();
    const sequence: Sequence = {
      id: shareSeq.id,
      courseId,
      primaryLessonId: typeof shareSeq.pl === 'number' ? lessonIdByIndex(shareSeq.pl) : null,
      name: shareSeq.n || 'Shared sequence',
      ...(shareSeq.d ? { description: shareSeq.d } : {}),
      items: shareSeq.items.map((item) => ({
        id: item.id,
        value: item.v,
        ...(item.l ? { label: item.l } : {}),
        ...(item.ci !== undefined ? { chunkIndex: item.ci } : {}),
        ...(item.sp ? { speaker: item.sp } : {}),
      })),
      cueWindow: shareSeq.cw,
      ...(shareSeq.cl && shareSeq.cl.length ? { chunkLabels: shareSeq.cl } : {}),
      ...(shareSeq.lc === 1 ? { generateLabelCards: true } : {}),
      ...(shareSeq.m === 'lines' ? { mode: 'lines' as const } : {}),
      ...(shareSeq.ms ? { mySpeaker: shareSeq.ms } : {}),
      ...(shareSeq.rc !== undefined ? { recitationChunkSize: shareSeq.rc } : {}),
      createdAt,
      updatedAt: createdAt,
    };
    await updateSequence(sequence);
    if (!mapping.sequenceIds.includes(sequence.id)) mapping.sequenceIds.push(sequence.id);
  }
}

/**
 * Insert a payload's occlusions via `updateOcclusion`, the occlusion counterpart to
 * {@link applySequences}: it owns "diff against the previous generation, touch content
 * fields only" through the same `diffRegeneration` contract, and covers the create case
 * because `db.occlusions.put` on an unknown id inserts and the diff against zero existing
 * cards is all-creates. Occlusion and region ids are the originating ids, adopted directly
 * (§7.1), so there is nothing to remap.
 *
 * The diagram itself never travels in a share code (Arc 6 §6.6), so `assetHash` will not
 * resolve for the student; the study face falls back to each card's plain-text content.
 */
export async function applyOcclusions(
  payload: LineagePayload,
  courseId: string,
  lessonIdByIndex: (index: number) => string | null,
  mapping: LineageIdMapping,
): Promise<void> {
  for (const shareOcc of payload.occlusions ?? []) {
    const createdAt = Date.now();
    const occlusion: Occlusion = {
      id: shareOcc.id,
      courseId,
      primaryLessonId: typeof shareOcc.pl === 'number' ? lessonIdByIndex(shareOcc.pl) : null,
      name: shareOcc.n || 'Shared occlusion',
      assetHash: shareOcc.ah,
      ...(payload.v !== 2 && shareOcc.regionConceptIds
        ? { regionConceptIds: shareOcc.regionConceptIds }
        : {}),
      regions: shareOcc.regions.map((region) => ({
        id: region.id,
        role: region.r === 1 ? ('feature' as const) : ('label' as const),
        shape: 'rectangle' as const,
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        ...(region.a ? { answerText: region.a } : {}),
        ...(region.p ? { pairedRegionId: region.p } : {}),
        ...(region.bn ? { backNote: region.bn } : {}),
      })),
      createdAt,
      updatedAt: createdAt,
    };
    await updateOcclusion(occlusion);
    const occlusionIds = (mapping.occlusionIds ??= []);
    if (!occlusionIds.includes(occlusion.id)) occlusionIds.push(occlusion.id);
  }
}
