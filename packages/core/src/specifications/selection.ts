import type {
  Specification,
  SpecificationPoint,
  SpecificationPaper,
  SpecificationAppliesTo,
  SpecificationSelection,
} from '@lacuna/core/specifications/catalogue';

/** Unrestricted scopes apply everywhere; a restricted scope needs the selection to match. */
export function appliesToSelection(
  scope: SpecificationAppliesTo,
  selection: SpecificationSelection,
): boolean {
  if (scope?.tiers && !(selection.tier !== undefined && scope.tiers.includes(selection.tier)))
    return false;
  if (scope?.routes && !scope.routes.some((route) => selection.routeIds?.includes(route)))
    return false;
  return true;
}

export function pointsForSelection(
  spec: Specification,
  selection: SpecificationSelection,
): SpecificationPoint[] {
  return spec.points.filter((item) => appliesToSelection(item.appliesTo, selection));
}

export function papersForSelection(
  spec: Specification,
  selection: SpecificationSelection,
): SpecificationPaper[] {
  return spec.papers.filter((item) => appliesToSelection(item.appliesTo, selection));
}

/** Points a paper covers within the selection, in document order. */
export function paperPoints(
  spec: Specification,
  paper: SpecificationPaper,
  selection: SpecificationSelection,
): SpecificationPoint[] {
  const applicable = pointsForSelection(spec, selection);
  if (paper.pointIds === 'all') return applicable;
  const covered = new Set(paper.pointIds);
  return applicable.filter((item) => covered.has(item.id));
}
