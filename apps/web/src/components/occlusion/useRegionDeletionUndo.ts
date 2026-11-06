import { useState, type Dispatch, type SetStateAction } from 'react';
import type { OcclusionRegion } from '@lacuna/core/db/types';

interface DeletedRegion {
  region: OcclusionRegion;
  index: number;
  pairedFeatures: string[];
}

export function useRegionDeletionUndo(
  regions: OcclusionRegion[],
  setRegions: Dispatch<SetStateAction<OcclusionRegion[]>>,
  selectRegion: Dispatch<SetStateAction<string | null>>,
) {
  const [history, setHistory] = useState<DeletedRegion[]>([]);
  return {
    canUndo: history.length > 0,
    deleteRegion(id: string) {
      const index = regions.findIndex((region) => region.id === id);
      if (index < 0) return;
      setHistory((entries) => [
        ...entries,
        {
          region: regions[index],
          index,
          pairedFeatures: regions.filter((region) => region.pairedRegionId === id).map((r) => r.id),
        },
      ]);
      setRegions((current) =>
        current
          .filter((region) => region.id !== id)
          .map((region) =>
            region.pairedRegionId === id ? { ...region, pairedRegionId: undefined } : region,
          ),
      );
      selectRegion((current) => (current === id ? null : current));
    },
    undo() {
      const deleted = history.at(-1);
      if (!deleted) return;
      setHistory((entries) => entries.slice(0, -1));
      setRegions((current) => {
        const restored = [...current];
        restored.splice(Math.min(deleted.index, restored.length), 0, deleted.region);
        return restored.map((region) =>
          region.role === 'feature' &&
          !region.pairedRegionId &&
          deleted.pairedFeatures.includes(region.id)
            ? { ...region, pairedRegionId: deleted.region.id }
            : region,
        );
      });
      selectRegion(deleted.region.id);
    },
  };
}
