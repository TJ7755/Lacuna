import { parseSpecification, type Specification } from './catalogue';
import type { SpecificationReference } from './links';

/** Validate course-supplied metadata without requiring a global catalogue. */
export function parseCourseSpecificationData(
  value: unknown,
  reference: SpecificationReference | undefined,
): Specification {
  const result = parseSpecification(value);
  if (!result.ok) throw new Error(`Invalid course specification: ${result.issues.join(' ')}`);
  assertCourseSpecificationSelection(result.specification, reference);
  return result.specification;
}

export function assertCourseSpecificationSelection(
  data: Specification | undefined,
  reference: SpecificationReference | undefined,
): void {
  if (data === undefined) return;
  if (reference?.specificationId !== data.id) {
    throw new Error('Course specification data must match its specification reference.');
  }
  if (reference.tier !== undefined && !data.tiers.some((tier) => tier.id === reference.tier)) {
    throw new Error('The selected tier is not part of the course specification.');
  }
  if (reference.routeIds?.some((id) => !data.routes.some((route) => route.id === id))) {
    throw new Error('A selected route is not part of the course specification.');
  }
}
