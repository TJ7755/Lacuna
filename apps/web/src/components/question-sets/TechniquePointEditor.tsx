import type { ReactNode } from 'react';
import type { AssessmentDimension, MarkAllocation } from '@lacuna/core/questions/questionSets';
import {
  activeTechniqueIds,
  isManualTechniqueDecision,
  suggestedTechniqueIds,
  techniqueName,
  type CourseTechnique,
  type SCIENCE_TECHNIQUES,
} from '@lacuna/core/questions/techniqueTags';
import { dimensionNames } from './presentation';

export function BuiltInPicker({
  techniques,
  onAdd,
  onDone,
}: {
  techniques: readonly (typeof SCIENCE_TECHNIQUES)[number][];
  onAdd: (ids: string[]) => void;
  onDone?: () => void;
}) {
  return (
    <section className="qs-technique-builtins" aria-label="Built-in science techniques">
      <p className="qs-technique-builtins-head">
        <span>Built-in science techniques</span>
        {onDone && (
          <button type="button" className="qs-technique-add" onClick={onDone}>
            Done
          </button>
        )}
      </p>
      <div className="qs-technique-chips">
        {techniques.map((technique) => (
          <button
            key={technique.id}
            type="button"
            className="qs-technique-chip"
            data-state="off"
            title={technique.description}
            aria-label={`Add ${technique.name}`}
            onClick={() => onAdd([technique.id])}
          >
            + {technique.name}
          </button>
        ))}
      </div>
      {techniques.length > 1 && (
        <button
          type="button"
          className="qs-technique-add"
          onClick={() => onAdd(techniques.map((technique) => technique.id))}
        >
          Add all
        </button>
      )}
    </section>
  );
}

export function PointTechniques({
  index,
  single,
  point,
  catalogue,
  available,
  readOnly,
  onDecide,
  onDimension,
  onReset,
}: {
  index: number;
  single: boolean;
  point: MarkAllocation;
  catalogue: readonly CourseTechnique[];
  available: readonly CourseTechnique[];
  readOnly: boolean;
  onDecide: (id: string, applies: boolean) => void;
  onDimension: (dimension: AssessmentDimension) => void;
  onReset: () => void;
}) {
  const active = activeTechniqueIds(point.techniqueTags);
  const suggested = suggestedTechniqueIds(point.techniqueTags);
  const name = single ? 'This point' : `Point ${index + 1}`;
  // Tags on techniques archived since keep showing here, so the author can still remove them.
  const archivedTagged = [...active, ...suggested].filter(
    (id) => !available.some((technique) => technique.id === id),
  );
  const chip = (id: string, label: string, title?: string): ReactNode => {
    const state = active.includes(id) ? 'on' : suggested.includes(id) ? 'unsure' : 'off';
    return (
      <span key={id} className="qs-technique-chip-wrap">
        <button
          type="button"
          className="qs-technique-chip"
          data-state={state}
          aria-pressed={state === 'on'}
          aria-label={state === 'unsure' ? `Confirm ${label}, suggested by Jev` : label}
          title={title}
          disabled={readOnly}
          onClick={() => onDecide(id, state !== 'on')}
        >
          {label}
          {state === 'unsure' && <span aria-hidden="true">?</span>}
        </button>
        {state === 'unsure' && !readOnly && (
          <button
            type="button"
            className="qs-technique-dismiss"
            aria-label={`Dismiss ${label}`}
            onClick={() => onDecide(id, false)}
          >
            ×
          </button>
        )}
      </span>
    );
  };
  const provenance = point.techniqueTags
    ? isManualTechniqueDecision(point.techniqueTags)
      ? 'Set by you'
      : point.techniqueTags.provenance.source === 'jev'
        ? `Jev (${point.techniqueTags.provenance.model})`
        : undefined
    : 'Not classified';
  return (
    <section className="qs-technique-point" aria-label={`${name}: ${point.criterion}`}>
      <p className="qs-technique-criterion">
        {!single && <span className="qs-technique-index">{index + 1}</span>}
        <span>{point.criterion || 'Untitled point'}</span>
        <span className="qs-technique-marks">
          {point.maxMarks} mark{point.maxMarks === 1 ? '' : 's'}
        </span>
      </p>
      <div className="qs-technique-chips" role="group" aria-label={`${name} techniques`}>
        {available.map((technique) => chip(technique.id, technique.name, technique.description))}
        {archivedTagged.map((id) =>
          chip(id, `${techniqueName(catalogue, id)} (archived)`, 'Archived technique'),
        )}
      </div>
      {suggested.length > 0 && (
        <p className="qs-technique-note is-unsure">
          Jev was unsure about the amber techniques. They do not count until you confirm them.
        </p>
      )}
      {active.length > 0 && point.dimension === 'knowledge' && (
        <p className="qs-technique-note is-warning">
          This point tests Knowledge, so its techniques do not count.{' '}
          <button type="button" onClick={() => onDimension('exam-execution')}>
            Mark as exam technique
          </button>
        </p>
      )}
      <div className="qs-technique-meta">
        <label>
          <span className="sr-only">{name} tests</span>
          <select
            value={point.dimension}
            onChange={(event) => onDimension(event.target.value as AssessmentDimension)}
          >
            {Object.entries(dimensionNames).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        {provenance && <span>{provenance}</span>}
        {point.techniqueTags && isManualTechniqueDecision(point.techniqueTags) && !readOnly && (
          <button type="button" onClick={onReset} title="The next Classify decides this point">
            Let Jev decide
          </button>
        )}
      </div>
    </section>
  );
}
