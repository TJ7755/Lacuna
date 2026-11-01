import { baseItemId } from '../db/sequenceGeneration';

export function conceptIdForSequenceItem(sequenceId: string, sequenceItemId: string): string {
  return `concept:sequence:${encodeURIComponent(sequenceId)}:${encodeURIComponent(baseItemId(sequenceItemId))}`;
}

export function conceptIdForRegion(occlusionId: string, regionId: string): string {
  return `concept:occlusion:${encodeURIComponent(occlusionId)}:${encodeURIComponent(regionId)}`;
}
