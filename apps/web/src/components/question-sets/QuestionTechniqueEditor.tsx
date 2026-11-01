import {
  SCIENCE_EXPLANATION_TECHNIQUES,
  SCIENCE_TECHNIQUES,
  type TechniqueTags,
} from '@lacuna/core/questions/techniqueTags';

export function QuestionTechniqueEditor({
  tags,
  onChange,
  disabled = false,
}: {
  tags: TechniqueTags | undefined;
  onChange: (tags: TechniqueTags | undefined) => void;
  disabled?: boolean;
}) {
  const techniques =
    tags?.taxonomyId === 'science-explanations'
      ? SCIENCE_EXPLANATION_TECHNIQUES
      : SCIENCE_TECHNIQUES;
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">Exam techniques</legend>
      <p className="qs-muted">
        Tag only what this marking point requires. Knowledge uses Concept links.
      </p>
      <label className="qs-field">
        Technique taxonomy
        <select
          value={tags?.taxonomyId ?? ''}
          onChange={(event) => {
            const taxonomyId = event.target.value as TechniqueTags['taxonomyId'] | '';
            onChange(
              taxonomyId
                ? {
                    taxonomyId,
                    taxonomyVersion: 1,
                    techniqueIds: (tags?.techniqueIds ?? []).filter(
                      (id) => taxonomyId === 'science-techniques' || id === 'causal-link',
                    ),
                    provenance: { source: 'author' },
                  }
                : undefined,
            );
          }}
        >
          <option value="">Unclassified</option>
          <option value="science-techniques">Science techniques v1</option>
          {tags?.taxonomyId === 'science-explanations' && (
            <option value="science-explanations">Science explanations v1 (legacy)</option>
          )}
        </select>
      </label>
      {tags && (
        <>
          {techniques.map((technique) => (
            <label className="qs-check items-start" key={technique.id}>
              <input
                type="checkbox"
                checked={tags.techniqueIds.includes(technique.id)}
                onChange={(event) =>
                  onChange({
                    ...tags,
                    techniqueIds: event.target.checked
                      ? [...tags.techniqueIds, technique.id]
                      : tags.techniqueIds.filter((id) => id !== technique.id),
                    provenance: { source: 'author' },
                  })
                }
              />
              <span>
                {technique.name}
                <span className="qs-muted block">{technique.description}</span>
              </span>
            </label>
          ))}
          <p className="qs-muted">
            {tags.techniqueIds.length === 0 && 'No applicable techniques in this taxonomy. '}
            {tags.provenance.source === 'jev'
              ? `Classified by Jev (${tags.provenance.model}). Editing records an author correction.`
              : 'Classified by the author.'}
          </p>
        </>
      )}
    </fieldset>
  );
}
