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

/** Built-in identities shared by every course, so their schedules survive re-enabling. */
export const builtInTechniqueIdSchema = z.enum(SCIENCE_TECHNIQUES.map((skill) => skill.id));
export type BuiltInTechniqueId = z.infer<typeof builtInTechniqueIdSchema>;
/** @deprecated Legacy taxonomy identities; course catalogues use {@link TechniqueId}. */
export const techniqueIdSchema = builtInTechniqueIdSchema;

export function isBuiltInTechniqueId(id: string): id is BuiltInTechniqueId {
  return builtInTechniqueIdSchema.safeParse(id).success;
}

/** Custom identities are namespaced so they can never collide with a built-in identity. */
export const CUSTOM_TECHNIQUE_ID_PREFIX = 'custom-';
const customTechniqueIdSchema = z.string().regex(/^custom-[0-9a-z][0-9a-z-]{7,63}$/);
export const courseTechniqueIdSchema = z.union([builtInTechniqueIdSchema, customTechniqueIdSchema]);
/** A built-in or course-scoped custom technique identity. */
export type TechniqueId = string;

export const COURSE_TECHNIQUE_LIMIT = 64;
export const TECHNIQUE_NAME_MAX = 80;
export const TECHNIQUE_TEXT_MAX = 400;

const optionalText = z.string().trim().min(1).max(TECHNIQUE_TEXT_MAX).optional();
export const courseTechniqueSchema = z.strictObject({
  id: courseTechniqueIdSchema,
  name: z.string().trim().min(1).max(TECHNIQUE_NAME_MAX),
  /** What a full-mark answer does. Optional, but Jev classifies more reliably with it. */
  description: optionalText,
  example: optionalText,
  /** Archived techniques keep their tags and history but leave pickers, Jev and Study. */
  archived: z.literal(true).optional(),
});
export type CourseTechnique = z.infer<typeof courseTechniqueSchema>;

export function techniqueNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('en-GB');
}

export const courseTechniquesSchema = z
  .array(courseTechniqueSchema)
  .max(COURSE_TECHNIQUE_LIMIT)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Duplicate technique identity.',
  )
  .refine((rows) => {
    const active = rows.filter((row) => !row.archived).map((row) => techniqueNameKey(row.name));
    return new Set(active).size === active.length;
  }, 'Duplicate technique name.');

export function validTechniqueSelection(tags: {
  taxonomyId: 'science-explanations' | 'science-techniques';
  techniqueIds: readonly BuiltInTechniqueId[];
}): boolean {
  return (
    new Set(tags.techniqueIds).size === tags.techniqueIds.length &&
    (tags.taxonomyId === 'science-techniques' ||
      (tags.techniqueIds.length <= 1 && tags.techniqueIds.every((id) => id === 'causal-link')))
  );
}

const jevModel = z.string().trim().min(1).max(120);

/** Fixed pilot taxonomies. Jev-attributed legacy tags never schedule. */
export const legacyTechniqueTagsSchema = z
  .strictObject({
    taxonomyId: z.enum(['science-explanations', 'science-techniques']),
    taxonomyVersion: z.literal(1),
    techniqueIds: z.array(builtInTechniqueIdSchema).max(SCIENCE_TECHNIQUES.length),
    provenance: z.discriminatedUnion('source', [
      z.strictObject({ source: z.literal('author') }),
      z.strictObject({ source: z.literal('jev'), model: jevModel }),
    ]),
  })
  .refine(validTechniqueSelection, 'Unsupported or duplicate technique tags.');

const courseTechniqueIds = z.array(courseTechniqueIdSchema).max(COURSE_TECHNIQUE_LIMIT);
const distinct = (ids: readonly string[]) => new Set(ids).size === ids.length;

/**
 * Tags against the owning course's catalogue. `techniqueIds` are active: authored, or
 * classified by Jev with confidence. `suggestedIds` are Jev's unsure classifications, shown
 * for review and never scheduled. Author provenance marks a manual decision that later
 * classification keeps; unreviewed suggestions survive it until the author decides them.
 */
export const courseTechniqueTagsSchema = z
  .strictObject({
    taxonomyId: z.literal('course'),
    taxonomyVersion: z.literal(1),
    techniqueIds: courseTechniqueIds,
    suggestedIds: courseTechniqueIds.optional(),
    provenance: z.discriminatedUnion('source', [
      z.strictObject({ source: z.literal('author') }),
      z.strictObject({ source: z.literal('jev'), model: jevModel }),
    ]),
  })
  .refine(
    (tags) =>
      distinct(tags.techniqueIds) &&
      distinct(tags.suggestedIds ?? []) &&
      !(tags.suggestedIds ?? []).some((id) => tags.techniqueIds.includes(id)),
    'Duplicate technique tags.',
  );

export const techniqueTagsSchema = z.union([legacyTechniqueTagsSchema, courseTechniqueTagsSchema]);

export type LegacyTechniqueTags = z.infer<typeof legacyTechniqueTagsSchema>;
export type CourseTechniqueTags = z.infer<typeof courseTechniqueTagsSchema>;
export type TechniqueTags = z.infer<typeof techniqueTagsSchema>;

/** Identities whose marks feed technique memory, before the allocation's dimension is applied. */
export function activeTechniqueIds(tags: TechniqueTags | undefined): readonly TechniqueId[] {
  if (!tags) return [];
  if (tags.taxonomyId === 'course') return tags.techniqueIds;
  return tags.provenance.source === 'author' ? tags.techniqueIds : [];
}

/**
 * Jev classifications awaiting an author's decision. Legacy Jev tags never scheduled, so they
 * are presented the same way rather than silently activated.
 */
export function suggestedTechniqueIds(tags: TechniqueTags | undefined): readonly TechniqueId[] {
  if (!tags) return [];
  if (tags.taxonomyId === 'course') return tags.suggestedIds ?? [];
  return tags.provenance.source === 'jev' ? tags.techniqueIds : [];
}

/** Record an author's decision on one technique; the point becomes a manual decision. */
export function decideTechnique(
  tags: TechniqueTags | undefined,
  id: TechniqueId,
  applies: boolean,
): CourseTechniqueTags {
  const active = activeTechniqueIds(tags).filter((row) => row !== id);
  const suggested = suggestedTechniqueIds(tags).filter(
    (row) => row !== id && !active.includes(row),
  );
  return {
    taxonomyId: 'course',
    taxonomyVersion: 1,
    techniqueIds: applies ? [...active, id] : active,
    ...(suggested.length ? { suggestedIds: suggested } : {}),
    provenance: { source: 'author' },
  };
}

/**
 * Jev's classification of one point. Confident identities become active; unsure ones are
 * suggested. Manual decisions are never replaced.
 */
export function classifiedTechniqueTags(
  current: TechniqueTags | undefined,
  result: { techniqueIds: readonly TechniqueId[]; suggestedIds: readonly TechniqueId[] },
  model: string,
): TechniqueTags | undefined {
  if (isManualTechniqueDecision(current)) return current;
  const techniqueIds = [...new Set(result.techniqueIds)];
  const suggestedIds = [...new Set(result.suggestedIds)].filter((id) => !techniqueIds.includes(id));
  return {
    taxonomyId: 'course',
    taxonomyVersion: 1,
    techniqueIds,
    ...(suggestedIds.length ? { suggestedIds } : {}),
    provenance: { source: 'jev', model },
  };
}

/** Whether a later classification may replace these tags. Manual decisions are kept. */
export function isManualTechniqueDecision(tags: TechniqueTags | undefined): boolean {
  return tags?.provenance.source === 'author';
}

/**
 * The catalogue a course offers. Built-in techniques already referenced by legacy or course
 * tags join it implicitly, so tags authored before course catalogues keep their names and
 * schedules without a data migration. A stored entry, including an archived one, wins.
 */
export function effectiveCourseTechniques(
  stored: readonly CourseTechnique[] | undefined,
  referencedIds: Iterable<string> = [],
): CourseTechnique[] {
  const catalogue = [...(stored ?? [])];
  const known = new Set(catalogue.map((row) => row.id));
  for (const id of referencedIds) {
    if (known.has(id) || !isBuiltInTechniqueId(id)) continue;
    known.add(id);
    const builtIn = SCIENCE_TECHNIQUES.find((row) => row.id === id)!;
    catalogue.push({ id: builtIn.id, name: builtIn.name, description: builtIn.description });
  }
  return catalogue;
}

/** Display name for any identity, including archived, removed or never-catalogued ones. */
export function techniqueName(catalogue: readonly CourseTechnique[], id: string): string {
  return (
    catalogue.find((row) => row.id === id)?.name ??
    SCIENCE_TECHNIQUES.find((row) => row.id === id)?.name ??
    'Removed technique'
  );
}
