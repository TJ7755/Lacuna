export interface SpecificationReference {
  specificationId: string;
  tier?: string;
  routeIds?: string[];
  [key: string]: unknown;
}

const idPattern = '[a-z0-9]+(?:[.-][a-z0-9]+)*';
const id = new RegExp(`^${idPattern}$`);
const qualifiedId = new RegExp(`^${idPattern}:${idPattern}$`);

function isId(value: unknown): value is string {
  return typeof value === 'string' && id.test(value);
}

export function isSpecificationReference(value: unknown): value is SpecificationReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return (
    isId(reference.specificationId) &&
    (reference.tier === undefined || isId(reference.tier)) &&
    (reference.routeIds === undefined ||
      (Array.isArray(reference.routeIds) &&
        [...reference.routeIds].every(isId) &&
        new Set(reference.routeIds).size === reference.routeIds.length))
  );
}

export function isQualifiedSpecificationPointId(value: unknown): value is string {
  return typeof value === 'string' && qualifiedId.test(value);
}

export function isSpecificationPointIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    [...value].every(isQualifiedSpecificationPointId) &&
    new Set(value).size === value.length
  );
}

export function parseSpecificationReference(value: unknown): SpecificationReference {
  if (!isSpecificationReference(value)) throw new Error('Invalid specification reference.');
  return value;
}

export function parseSpecificationPointIds(value: unknown): string[] {
  if (!isSpecificationPointIds(value)) throw new Error('Invalid specification point links.');
  return value;
}

export function parseQualifiedSpecificationPointId(value: unknown): string {
  if (!isQualifiedSpecificationPointId(value)) throw new Error('Invalid qualified point id.');
  return value;
}
