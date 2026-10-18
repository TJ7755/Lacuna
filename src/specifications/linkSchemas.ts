import { z } from 'zod';
import {
  isSpecificationPointIds,
  isSpecificationReference,
  type SpecificationReference,
} from './links';

// Repository writes use the same synchronous predicates without loading Zod in startup code.
export const specificationRefSchema = z.custom<SpecificationReference>(
  isSpecificationReference,
  'Invalid specification reference.',
);
export const specificationPointIdsSchema = z.custom<string[]>(
  isSpecificationPointIds,
  'Invalid specification point links.',
);
