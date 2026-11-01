import { PillToggleGroup } from '../cards/PillToggleGroup';
import { Select } from '../ui/Select';
import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
// Region list and detail pane for the occlusion editor (Task 10, D1 adapted —
// design/arc6/plan.md): role chips, inline pairing, and a detail pane for
// role/answer text/back note. Region names default to "Box 1…n" (labels) and
// "Region 1…n" (features) so the list stays navigable without typing.

import { useLayoutEffect, useRef } from 'react';
import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';
import type { OcclusionRegion } from '@lacuna/core/db/types';

/** Display-only names — never persisted — derived from a region's position among
 *  same-role regions, matching the chosen mockup (design/arc6/mockups-occlusion.html). */
function occlusionRegionNames(regions: OcclusionRegion[]): Map<string, string> {
  const names = new Map<string, string>();
  let labelIndex = 0;
  let featureIndex = 0;
  for (const region of regions) {
    if (region.role === 'label') {
      labelIndex += 1;
      names.set(region.id, `Box ${labelIndex}`);
    } else {
      featureIndex += 1;
      names.set(region.id, `Region ${featureIndex}`);
    }
  }
  return names;
}

interface OcclusionRegionPaneProps {
  regions: OcclusionRegion[];
  selectedRegionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<OcclusionRegion>) => void;
  /** Takes focus when the last region is deleted, so it never falls to the page. */
  onEmptied: () => void;
}

export function OcclusionRegionPane({
  regions,
  selectedRegionId,
  onSelect,
  onDelete,
  onUpdate,
  onEmptied,
}: OcclusionRegionPaneProps) {
  const names = occlusionRegionNames(regions);
  const selected = regions.find((r) => r.id === selectedRegionId) ?? null;
  const labelRegions = regions.filter((r) => r.role === 'label');
  const listRef = useRef<HTMLUListElement>(null);
  const deletedIndex = useRef<number | null>(null);

  // A deleted region's button unmounts with it, so focus moves to the region that
  // took its place, else the one before, else back to the canvas.
  useLayoutEffect(() => {
    const index = deletedIndex.current;
    if (index === null) return;
    deletedIndex.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-region-delete]');
    const next = buttons?.[Math.min(index, buttons.length - 1)];
    if (next) next.focus();
    else onEmptied();
  }, [regions, onEmptied]);

  return (
    <div className="flex min-w-0 flex-col border-t border-line min-[760px]:border-l min-[760px]:border-t-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-lg text-ink">Regions</h2>
        <span className="text-sm tabular-nums text-ink-soft">{regions.length}</span>
      </div>

      {regions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-faint">
          Draw a box on the diagram to add a region.
        </p>
      ) : (
        <ul ref={listRef} className="flex max-h-56 flex-col gap-0.5 overflow-y-auto p-1.5">
          {regions.map((region, index) => {
            const name = names.get(region.id)!;
            const pairedName = region.pairedRegionId ? names.get(region.pairedRegionId) : undefined;
            const current = region.id === selectedRegionId;
            return (
              <li key={region.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(region.id)}
                  aria-current={current}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 min-h-11 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors',
                    current
                      ? 'bg-accent-soft text-accent-ink'
                      : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
                  )}
                >
                  <span className="shrink-0 rounded-full bg-ink/5 px-2 py-1 text-xs text-ink-faint">
                    {region.role === 'label' ? 'Label' : 'Feature'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {name}
                    {pairedName ? ` → ${pairedName}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  data-region-delete=""
                  onClick={() => {
                    deletedIndex.current = index;
                    onDelete(region.id);
                  }}
                  aria-label={`Delete ${name}`}
                  className="hit-target shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <div className="flex flex-col gap-3 border-t border-line p-5">
          <div>
            <p className={`${fieldLabelClassName} mb-2`}>Role</p>
            <PillToggleGroup
              label="Role"
              value={selected.role}
              onChange={(role) =>
                onUpdate(
                  selected.id,
                  role === 'label' ? { role, pairedRegionId: undefined } : { role },
                )
              }
              options={[
                { value: 'label', label: 'Label box' },
                { value: 'feature', label: 'Feature' },
              ]}
              size="sm"
            />
          </div>

          {selected.role === 'feature' && (
            <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
              <span className={fieldLabelClassName}>Paired label</span>
              <Select
                value={selected.pairedRegionId ?? ''}
                onChange={(e) =>
                  onUpdate(selected.id, { pairedRegionId: e.target.value || undefined })
                }
              >
                <option value="">Not paired</option>
                {labelRegions.map((label) => (
                  <option key={label.id} value={label.id}>
                    {names.get(label.id)}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {(selected.role === 'label' || !selected.pairedRegionId) && (
            <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
              <span className={fieldLabelClassName}>
                Answer text <span className="text-ink-faint/70">(optional)</span>
              </span>
              <input
                type="text"
                value={selected.answerText ?? ''}
                onChange={(e) => onUpdate(selected.id, { answerText: e.target.value || undefined })}
                placeholder="Only needed for typed mode"
                className={`${inputFrameClassName} min-h-11 text-sm`}
              />
            </label>
          )}

          <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
            <span className={fieldLabelClassName}>
              Note on back <span className="text-ink-faint/70">(optional)</span>
            </span>
            <input
              type="text"
              value={selected.backNote ?? ''}
              onChange={(e) => onUpdate(selected.id, { backNote: e.target.value || undefined })}
              className={`${inputFrameClassName} min-h-11 text-sm`}
            />
          </label>
        </div>
      ) : (
        regions.length > 0 && (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-faint">
            Select a region to edit it.
          </p>
        )
      )}
    </div>
  );
}
