import { z } from 'zod';

const idPattern = '[a-z0-9]+(?:[.-][a-z0-9]+)*';
const id = z.string().regex(new RegExp(`^${idPattern}$`), 'Use lower-case kebab or dotted ids.');
const uniqueIds = z
  .array(id)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate ids are not allowed.');

export const specificationRefSchema = z.looseObject({
  specificationId: id,
  tier: id.optional(),
  routeIds: uniqueIds.optional(),
});

export type SpecificationReference = z.infer<typeof specificationRefSchema>;

export const qualifiedSpecificationPointIdSchema = z
  .string()
  .regex(
    new RegExp(`^${idPattern}:${idPattern}$`),
    'Use a qualified specificationId:pointId with lower-case kebab or dotted ids.',
  );

export const specificationPointIdsSchema = z
  .array(qualifiedSpecificationPointIdSchema)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Duplicate specification point ids are not allowed.',
  );
