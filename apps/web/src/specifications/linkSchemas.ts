import { z } from 'zod';
import { parseSpecification, type Specification } from '@lacuna/core/specifications/catalogue';
import {
  isSpecificationPointIds,
  isSpecificationReference,
  type SpecificationReference,
} from '@lacuna/core/specifications/links';

// Repository writes use the same synchronous predicates without loading Zod in startup code.
export const specificationRefSchema = z.custom<SpecificationReference>(
  isSpecificationReference,
  'Invalid specification reference.',
);
export const specificationPointIdsSchema = z.custom<string[]>(
  isSpecificationPointIds,
  'Invalid specification point links.',
);

export const specificationDataSchema = z.custom<Specification>(
  (value) => parseSpecification(value).ok,
  'Invalid course specification data.',
);

export const specificationCoverageFields = {
  specificationPaperId: z
    .string()
    .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
    .optional(),
  specificationPointIds: specificationPointIdsSchema.optional(),
};

export function validSpecificationCoverageSelector(value: {
  specificationPaperId?: string;
  specificationPointIds?: string[];
}): boolean {
  return value.specificationPaperId !== undefined
    ? value.specificationPointIds === undefined
    : value.specificationPointIds !== undefined && value.specificationPointIds.length > 0;
}
