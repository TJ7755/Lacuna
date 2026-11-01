import type { Occlusion, Sequence, SequenceItem, SequencePresetId } from '@lacuna/core/db/types';
import type { SharePayload } from './sharePayload';
import { getPreset } from './sequencePresets';

type CourseSharePayload = Exclude<SharePayload, { v: 1 }>;

interface GeneratedImportContext {
  payload: CourseSharePayload;
  courseId: string;
  lessonIds: string[];
  importedAt: number;
}

export function planSharedSequences({
  payload,
  courseId,
  lessonIds,
  importedAt,
  sequenceIdMap,
  itemIdMap,
}: GeneratedImportContext & {
  sequenceIdMap: Map<string, string>;
  itemIdMap: Map<string, string>;
}): Sequence[] {
  return (payload.sequences ?? []).map((shareSeq, index) => {
    const items: SequenceItem[] = shareSeq.items.map((item) => ({
      id: itemIdMap.get(item.id)!,
      value: item.v,
      ...(item.l ? { label: item.l } : {}),
      ...(item.ci !== undefined ? { chunkIndex: item.ci } : {}),
      ...(item.sp ? { speaker: item.sp } : {}),
    }));
    const primaryLessonId =
      typeof shareSeq.pl === 'number' ? (lessonIds[shareSeq.pl] ?? null) : null;
    return {
      id: sequenceIdMap.get(shareSeq.id)!,
      courseId,
      primaryLessonId,
      name: shareSeq.n || 'Shared sequence',
      ...(shareSeq.d ? { description: shareSeq.d } : {}),
      items,
      cueWindow: shareSeq.cw,
      ...(shareSeq.cl && shareSeq.cl.length ? { chunkLabels: shareSeq.cl } : {}),
      ...(shareSeq.lc === 1 ? { generateLabelCards: true } : {}),
      ...(shareSeq.m === 'lines' ? { mode: 'lines' as const } : {}),
      ...(shareSeq.ms ? { mySpeaker: shareSeq.ms } : {}),
      ...(shareSeq.rc !== undefined ? { recitationChunkSize: shareSeq.rc } : {}),
      // `pr` only travels when it diverges from the m/ms inference (see the export
      // side above); resolve it through getPreset so an unrecognised id degrades to
      // 'list' rather than sticking around as an invalid presetId.
      ...(shareSeq.pr ? { presetId: getPreset(shareSeq.pr as SequencePresetId).id } : {}),
      createdAt: importedAt + index,
      updatedAt: importedAt + index,
    };
  });
}

export function planSharedOcclusions({
  payload,
  courseId,
  lessonIds,
  importedAt,
  occlusionIdMap,
  regionIdMap,
  conceptIdMap,
}: GeneratedImportContext & {
  occlusionIdMap: Map<string, string>;
  regionIdMap: Map<string, string>;
  conceptIdMap: Map<string, string>;
}): Occlusion[] {
  return (payload.occlusions ?? []).map((shareOcc, index) => ({
    id: occlusionIdMap.get(shareOcc.id)!,
    courseId,
    primaryLessonId: typeof shareOcc.pl === 'number' ? (lessonIds[shareOcc.pl] ?? null) : null,
    name: shareOcc.n || 'Shared occlusion',
    assetHash: shareOcc.ah,
    ...(payload.v !== 2 && shareOcc.regionConceptIds
      ? {
          regionConceptIds: Object.fromEntries(
            Object.entries(shareOcc.regionConceptIds).map(([regionId, conceptId]) => {
              const localRegionId = regionIdMap.get(regionId);
              const localConceptId = conceptIdMap.get(conceptId);
              if (!localRegionId || !localConceptId)
                throw new Error('Unknown Occlusion Concept relationship.');
              return [localRegionId, localConceptId];
            }),
          ),
        }
      : {}),
    regions: shareOcc.regions.map((region) => ({
      id: regionIdMap.get(region.id)!,
      role: region.r === 1 ? ('feature' as const) : ('label' as const),
      shape: 'rectangle' as const,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      ...(region.a ? { answerText: region.a } : {}),
      // Drop a pairing whose target region did not travel, rather than leaving a
      // dangling reference — an unpaired feature falls back to its answerText.
      ...(region.p && regionIdMap.has(region.p)
        ? { pairedRegionId: regionIdMap.get(region.p)! }
        : {}),
      ...(region.bn ? { backNote: region.bn } : {}),
    })),
    createdAt: importedAt + index,
    updatedAt: importedAt + index,
  }));
}
