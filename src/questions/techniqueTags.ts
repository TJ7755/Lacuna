import { z } from 'zod';

/** Pilot skills describe the demand of a criterion, never a learner's diagnosis. */
export const SCIENCE_EXPLANATION_TECHNIQUES = [
  {
    id: 'causal-link',
    name: 'Link cause and effect',
    description: 'Connect the relevant mechanism to its consequence rather than listing facts.',
    example: 'Link an altered active site to reduced substrate binding and a slower reaction.',
  },
] as const;

export const SCIENCE_TECHNIQUES = [
  ...SCIENCE_EXPLANATION_TECHNIQUES,
  {
    id: 'paired-comparison',
    name: 'Compare like with like',
    description:
      'Compare both subjects on the same named property, with the relevant similarity or difference.',
  },
  {
    id: 'evidence-based-judgement',
    name: 'Support a judgement',
    description:
      'Use the supplied evidence to support a conclusion and account for relevant limitations.',
  },
  {
    id: 'graph-interpretation',
    name: 'Interpret a graph',
    description:
      'Read the relevant axes, scales and values and use them to describe or explain the required relationship.',
  },
  {
    id: 'calculation-setup',
    name: 'Set up a calculation',
    description: 'Choose the appropriate relationship and arrange it for the quantity requested.',
  },
  {
    id: 'substitution',
    name: 'Substitute values',
    description:
      'Put the relevant supplied values into the correct places in the chosen relationship.',
  },
  {
    id: 'unit-conversion',
    name: 'Convert units',
    description:
      'Convert the relevant quantities to compatible units using the correct scale factor.',
  },
  {
    id: 'practical-controls',
    name: 'Control a practical',
    description:
      'Identify the relevant control and explain how to hold it constant or use it for a valid comparison.',
  },
] as const;

export const techniqueIdSchema = z.enum(SCIENCE_TECHNIQUES.map((skill) => skill.id));
export type TechniqueId = z.infer<typeof techniqueIdSchema>;

export function validTechniqueSelection(tags: {
  taxonomyId: 'science-explanations' | 'science-techniques';
  techniqueIds: readonly TechniqueId[];
}): boolean {
  return (
    new Set(tags.techniqueIds).size === tags.techniqueIds.length &&
    (tags.taxonomyId === 'science-techniques' ||
      (tags.techniqueIds.length <= 1 && tags.techniqueIds.every((id) => id === 'causal-link')))
  );
}

export const techniqueTagsSchema = z
  .strictObject({
    taxonomyId: z.enum(['science-explanations', 'science-techniques']),
    taxonomyVersion: z.literal(1),
    techniqueIds: z.array(techniqueIdSchema).max(SCIENCE_TECHNIQUES.length),
    provenance: z.discriminatedUnion('source', [
      z.strictObject({ source: z.literal('author') }),
      z.strictObject({ source: z.literal('jev'), model: z.string().trim().min(1).max(120) }),
    ]),
  })
  .refine(validTechniqueSelection, 'Unsupported or duplicate technique tags.');

export type TechniqueTags = z.infer<typeof techniqueTagsSchema>;
