import {
  appliesToSelection,
  type Specification,
  type SpecificationSelection,
} from '@lacuna/core/specifications/catalogue';

interface TaggedCard {
  id: string;
  conceptId?: string;
  tags?: readonly string[];
}

interface TaggedCardReference {
  cardId: string;
  conceptId?: string;
  tag: string;
}

export interface SpecPointTagResolution {
  matched: (TaggedCardReference & { specificationPointId: string })[];
  ambiguous: (TaggedCardReference & { specificationPointIds: string[] })[];
  unmatched: TaggedCardReference[];
}

/** Propose links for review; this never changes Cards, Concepts or their tags. */
export function resolveSpecPointTags(
  cards: readonly TaggedCard[],
  specification: Specification,
): SpecPointTagResolution {
  const byReference = new Map<string, string[]>();
  for (const point of specification.points) {
    const candidates = byReference.get(point.ref) ?? [];
    candidates.push(`${specification.id}:${point.id}`);
    byReference.set(point.ref, candidates);
  }
  const result: SpecPointTagResolution = { matched: [], ambiguous: [], unmatched: [] };
  for (const card of cards) {
    for (const tag of new Set(card.tags ?? [])) {
      if (!tag.startsWith('spec:')) continue;
      const reference: TaggedCardReference = {
        cardId: card.id,
        ...(card.conceptId === undefined ? {} : { conceptId: card.conceptId }),
        tag,
      };
      const parts = tag.split(':');
      const pointReference =
        parts.length === 2
          ? parts[1]
          : parts.length === 3 && parts[1].toLowerCase() === specification.code.toLowerCase()
            ? parts[2]
            : undefined;
      const candidates = pointReference ? (byReference.get(pointReference) ?? []) : [];
      if (candidates.length === 1) {
        result.matched.push({ ...reference, specificationPointId: candidates[0] });
      } else if (candidates.length > 1) {
        result.ambiguous.push({ ...reference, specificationPointIds: [...candidates] });
      } else {
        result.unmatched.push(reference);
      }
    }
  }
  return result;
}

interface UnavailableSpecificationPointLink {
  specificationPointId: string;
  reason: 'other-specification' | 'unknown-point' | 'outside-selection';
}

/** Report retained links that a course's current specification selection cannot show. */
export function unavailableSpecificationPointLinks(
  specificationPointIds: readonly string[],
  specification: Specification,
  selection: SpecificationSelection,
): UnavailableSpecificationPointLink[] {
  const prefix = `${specification.id}:`;
  const points = new Map(specification.points.map((point) => [point.id, point]));
  const unavailable: UnavailableSpecificationPointLink[] = [];
  for (const specificationPointId of specificationPointIds) {
    if (!specificationPointId.startsWith(prefix)) {
      unavailable.push({ specificationPointId, reason: 'other-specification' });
      continue;
    }
    const point = points.get(specificationPointId.slice(prefix.length));
    if (!point) {
      unavailable.push({ specificationPointId, reason: 'unknown-point' });
    } else if (!appliesToSelection(point.appliesTo, selection)) {
      unavailable.push({ specificationPointId, reason: 'outside-selection' });
    }
  }
  return unavailable;
}
