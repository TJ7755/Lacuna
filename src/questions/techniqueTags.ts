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

export const techniqueTagsSchema = z.strictObject({
  taxonomyId: z.literal('science-explanations'),
  taxonomyVersion: z.literal(1),
  techniqueIds: z.array(z.enum(SCIENCE_EXPLANATION_TECHNIQUES.map((skill) => skill.id))).max(1),
  provenance: z.discriminatedUnion('source', [
    z.strictObject({ source: z.literal('author') }),
    z.strictObject({ source: z.literal('jev'), model: z.string().trim().min(1).max(120) }),
  ]),
});

export type TechniqueTags = z.infer<typeof techniqueTagsSchema>;
