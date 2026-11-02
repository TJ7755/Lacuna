import { AnimatePresence, m as motion } from 'motion/react';
import type { AssessmentDimension, MarkAllocation } from '@lacuna/core/questions/questionSets';
import {
  activeTechniqueIds,
  isManualTechniqueDecision,
  suggestedTechniqueIds,
  techniqueName,
  type CourseTechnique,
  type SCIENCE_TECHNIQUES,
} from '@lacuna/core/questions/techniqueTags';
import { CloseIcon } from '../ui/icons';
import { motionTransition } from '../ui/motion';
import { dimensionNames } from './presentation';

export function BuiltInPicker({
  techniques,
  onAdd,
}: {
  techniques: readonly (typeof SCIENCE_TECHNIQUES)[number][];
  onAdd: (ids: string[]) => void;
}) {
  return (
    <section className="qs-technique-chips" aria-label="Built-in techniques">
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
      {techniques.length > 1 && (
        <button
          type="button"
          className="qs-technique-link"
          onClick={() => onAdd(techniques.map((technique) => technique.id))}
        >
          Add all
        </button>
      )}
    </section>
  );
}

/**
 * One marking point: its criterion, a chip per technique and a single line of controls.
 * Outlined chips are Jev's unsure suggestions; the outline and the accessible name carry the
 * meaning, so no explanatory text is needed. Chips glide to their new places rather than jump
 * when a dismiss control comes or goes.
 */
export function PointTechniques({
  index,
  single,
  point,
  catalogue,
  available,
  readOnly,
  multiplier,
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
  multiplier: number;
  onDecide: (id: string, applies: boolean) => void;
  onDimension: (dimension: AssessmentDimension) => void;
  onReset: () => void;
}) {
  const active = activeTechniqueIds(point.techniqueTags);
  const suggested = suggestedTechniqueIds(point.techniqueTags);
  const name = single ? 'This point' : `Point ${index + 1}`;
  const glide = motionTransition('feedback', multiplier);
  // Tags on techniques archived since keep showing here, so the author can still remove them.
  const archivedTagged = [...active, ...suggested].filter(
    (id) => !available.some((technique) => technique.id === id),
  );
  const chip = (id: string, label: string, title?: string) => {
    const state = active.includes(id) ? 'on' : suggested.includes(id) ? 'unsure' : 'off';
    return (
      <motion.span
        key={id}
        layout={multiplier > 0 ? 'position' : false}
        transition={glide}
        className="qs-technique-chip-wrap"
      >
        <button
          type="button"
          className="qs-technique-chip"
          data-state={state}
          aria-pressed={state === 'on'}
          aria-label={state === 'unsure' ? `Confirm suggested ${label}` : label}
          title={title}
          disabled={readOnly}
          onClick={() => onDecide(id, state !== 'on')}
        >
          {label}
        </button>
        <AnimatePresence initial={false}>
          {state === 'unsure' && !readOnly && (
            <motion.button
              type="button"
              className="qs-technique-dismiss"
              aria-label={`Dismiss ${label}`}
              initial={multiplier > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={multiplier > 0 ? { opacity: 0 } : undefined}
              transition={glide}
              onClick={() => onDecide(id, false)}
            >
              <CloseIcon width={12} height={12} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.span>
    );
  };
  const manual = point.techniqueTags && isManualTechniqueDecision(point.techniqueTags);
  const knowledgeTagged = active.length > 0 && point.dimension === 'knowledge';
  return (
    <section className="qs-technique-point" aria-label={`${name}: ${point.criterion}`}>
      <p className="qs-technique-criterion">
        {!single && <span className="qs-technique-index">{index + 1}</span>}
        <span>{point.criterion || '–'}</span>
      </p>
      <div className="qs-technique-chips" role="group" aria-label={`${name} techniques`}>
        {available.map((technique) => chip(technique.id, technique.name, technique.description))}
        {archivedTagged.map((id) =>
          chip(id, `${techniqueName(catalogue, id)} (archived)`, 'Archived technique'),
        )}
      </div>
      {/* One fixed-height line: controls appear and go within it, never below it. */}
      <div className="qs-technique-meta">
        <select
          className="lacuna-select"
          aria-label={`${name} tests`}
          value={point.dimension}
          data-warning={knowledgeTagged || undefined}
          title={knowledgeTagged ? 'Knowledge points do not count towards techniques' : undefined}
          onChange={(event) => onDimension(event.target.value as AssessmentDimension)}
        >
          {Object.entries(dimensionNames).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        {knowledgeTagged && (
          <button
            type="button"
            className="qs-technique-link is-warning"
            title="Knowledge points do not count towards techniques"
            onClick={() => onDimension('exam-execution')}
          >
            Count it
          </button>
        )}
        <span className="qs-technique-source">
          {manual && !readOnly ? (
            <button
              type="button"
              className="qs-technique-link"
              title="Clear your choices so Classify decides this point"
              onClick={onReset}
            >
              Reset
            </button>
          ) : point.techniqueTags?.provenance.source === 'jev' ? (
            <span title="Tagged by Classify">Auto</span>
          ) : null}
        </span>
      </div>
    </section>
  );
}
