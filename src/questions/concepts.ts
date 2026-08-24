import type { CardType } from '../db/types';
import type { Concept } from './types';

export function normaliseConceptName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function plainText(source: string): string {
  return source
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '$1')
    .replace(/[`*_>#~[\]]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function conceptNameForCard(type: CardType, front: string, back: string): string {
  const preferred = type === 'cloze' ? front : back || front;
  const fallback = preferred === front ? back : front;
  const name = plainText(preferred) || plainText(fallback) || 'Untitled concept';
  return name.length > 96 ? `${name.slice(0, 95).trimEnd()}…` : name;
}

export function buildCardConcept(args: {
  id: string;
  courseId?: string | null;
  schedulingUnitId: string;
  name: string;
  now: number;
  provisional?: boolean;
}): Concept {
  if (args.courseId) {
    return {
      id: args.id,
      scope: 'course',
      scopeKey: `course:${args.courseId}`,
      courseId: args.courseId,
      name: args.name,
      provisional: args.provisional ?? false,
      createdAt: args.now,
      updatedAt: args.now,
    };
  }
  return {
    id: args.id,
    scope: 'legacy-scheduling-unit',
    scopeKey: `legacy-scheduling-unit:${args.schedulingUnitId}`,
    courseId: null,
    legacySchedulingUnitId: args.schedulingUnitId,
    name: args.name,
    provisional: true,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export function conceptMatchesCardScope(
  concept: Concept,
  courseId: string | null | undefined,
  schedulingUnitId: string,
): boolean {
  return courseId
    ? concept.scope === 'course' && concept.courseId === courseId
    : concept.scope === 'legacy-scheduling-unit' &&
        concept.legacySchedulingUnitId === schedulingUnitId;
}
