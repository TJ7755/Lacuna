// Region list and detail pane for the occlusion editor (Task 10, D1 adapted —
// design/arc6/plan.md §6.5): role chips, inline pairing, and a detail pane for
// role/answer text/back note. Region names default to "Box 1…n" (labels) and
// "Region 1…n" (features) so the list stays navigable without typing.

import { cn } from '../ui/cn';
import { CloseIcon } from '../ui/icons';
import type { OcclusionRegion } from '../../db/types';

/** Display-only names — never persisted — derived from a region's position among
 *  same-role regions, matching the chosen mockup (design/arc6/mockups-occlusion.html). */
export function occlusionRegionNames(regions: OcclusionRegion[]): Map<string, string> {
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
}

export function OcclusionRegionPane({
  regions,
  selectedRegionId,
  onSelect,
  onDelete,
  onUpdate,
}: OcclusionRegionPaneProps) {
  const names = occlusionRegionNames(regions);
  const selected = regions.find((r) => r.id === selectedRegionId) ?? null;
  const labelRegions = regions.filter((r) => r.role === 'label');

  return (
    <div className="flex min-w-0 flex-col border-t border-line min-[760px]:border-l min-[760px]:border-t-0">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs uppercase tracking-[0.1em] text-ink-faint">
        <span>Regions</span>
        <span>{regions.length}</span>
      </div>

      {regions.length === 0 ? (
        <p className="px-3 py-4 text-sm text-ink-faint">Draw a box on the diagram to add a region.</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto p-1.5">
          {regions.map((region) => {
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
                    'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                    current ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
                  )}
                >
                  <span className="shrink-0 rounded border border-line-strong px-1 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                    {region.role === 'label' ? 'lbl' : 'ftr'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {name}
                    {pairedName ? ` → ${pairedName}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(region.id)}
                  aria-label={`Delete ${name}`}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint">Role</div>
            <div className="flex gap-1.5">
              <RoleButton
                label="Label box"
                active={selected.role === 'label'}
                onClick={() => onUpdate(selected.id, { role: 'label', pairedRegionId: undefined })}
              />
              <RoleButton
                label="Feature"
                active={selected.role === 'feature'}
                onClick={() => onUpdate(selected.id, { role: 'feature' })}
              />
            </div>
          </div>

          {selected.role === 'feature' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Paired label</span>
              <select
                value={selected.pairedRegionId ?? ''}
                onChange={(e) => onUpdate(selected.id, { pairedRegionId: e.target.value || undefined })}
                className="min-h-9 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Not paired</option>
                {labelRegions.map((label) => (
                  <option key={label.id} value={label.id}>
                    {names.get(label.id)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(selected.role === 'label' || !selected.pairedRegionId) && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                Answer text <span className="normal-case text-ink-faint/70">(optional)</span>
              </span>
              <input
                type="text"
                value={selected.answerText ?? ''}
                onChange={(e) => onUpdate(selected.id, { answerText: e.target.value || undefined })}
                placeholder="Only needed for typed mode"
                className="min-h-9 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
              Note on back <span className="normal-case text-ink-faint/70">(optional)</span>
            </span>
            <input
              type="text"
              value={selected.backNote ?? ''}
              onChange={(e) => onUpdate(selected.id, { backNote: e.target.value || undefined })}
              className="min-h-9 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      ) : (
        regions.length > 0 && (
          <p className="border-t border-line px-3 py-4 text-sm text-ink-faint">
            Select a region to edit it.
          </p>
        )
      )}
    </div>
  );
}

function RoleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
