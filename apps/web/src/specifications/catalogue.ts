import { z } from 'zod';

/**
 * Format and validation for specification metadata supplied with Courses. Source references
 * describe the author's evidence; parsing does not certify authenticity or completeness.
 */

const id = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'Use lower-case kebab or dotted ids.');
const text = z.string().trim().min(1);
const ids = z.array(id);

const appliesTo = z
  .strictObject({ tiers: ids.min(1).optional(), routes: ids.min(1).optional() })
  .optional();

const option = z.strictObject({ id, name: text });

const point = z.strictObject({
  id,
  ref: text,
  title: text,
  parentId: id.nullable(),
  kind: z.enum(['content', 'vocabulary']),
  appliesTo,
});

const paper = z.strictObject({
  id,
  ref: text,
  title: text,
  durationMinutes: z.number().int().positive(),
  totalMarks: z.number().int().positive(),
  /** `all` covers every point applicable to the paper's tier and route. */
  pointIds: z.union([z.literal('all'), ids.min(1)]),
  appliesTo,
});

const specificationSchema = z.strictObject({
  id,
  board: z.enum(['aqa', 'pearson-edexcel', 'ocr', 'cambridge']),
  qualification: z.enum(['gcse', 'international-gcse', 'cambridge-igcse-9-1', 'fsmq']),
  code: text,
  title: text,
  firstExamination: z.number().int().min(2000).max(2100),
  source: z.strictObject({ document: text, issue: text, url: z.url() }),
  tiers: z.array(option),
  routes: z.array(option),
  assessmentObjectives: z.array(
    z.strictObject({
      id: text,
      description: text,
      weightingPercent: z.number().positive().max(100).optional(),
    }),
  ),
  commandWords: z.array(z.strictObject({ word: text, meaning: text })),
  /** Document order; a parent precedes its children. */
  points: z.array(point).min(1),
  papers: z.array(paper).min(1),
});

export type Specification = z.infer<typeof specificationSchema>;
export type SpecificationPoint = Specification['points'][number];
export type SpecificationPaper = Specification['papers'][number];
export type SpecificationAppliesTo = SpecificationPoint['appliesTo'];

/** A course's choice within a specification. */
export interface SpecificationSelection {
  tier?: string;
  routeIds?: readonly string[];
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

function semanticIssues(spec: Specification): string[] {
  const issues: string[] = [];
  const tiers = new Set(spec.tiers.map((tier) => tier.id));
  const routes = new Set(spec.routes.map((route) => route.id));
  const pointIds = new Set<string>();

  const checkAppliesTo = (scope: SpecificationAppliesTo, path: string) => {
    for (const tier of scope?.tiers ?? []) {
      if (!tiers.has(tier)) issues.push(`${path} names unknown tier ${tier}.`);
    }
    for (const route of scope?.routes ?? []) {
      if (!routes.has(route)) issues.push(`${path} names unknown route ${route}.`);
    }
  };

  for (const value of duplicates(spec.tiers.map((tier) => tier.id)))
    issues.push(`Duplicate tier ${value}.`);
  for (const value of duplicates(spec.routes.map((route) => route.id)))
    issues.push(`Duplicate route ${value}.`);
  for (const value of duplicates(spec.points.map((item) => item.id)))
    issues.push(`Duplicate point ${value}.`);
  for (const value of duplicates(spec.papers.map((item) => item.id)))
    issues.push(`Duplicate paper ${value}.`);
  for (const value of duplicates(spec.assessmentObjectives.map((item) => item.id))) {
    issues.push(`Duplicate assessment objective ${value}.`);
  }
  for (const value of duplicates(spec.commandWords.map((item) => item.word.toLowerCase()))) {
    issues.push(`Duplicate command word ${value}.`);
  }

  for (const item of spec.points) {
    // Requiring parents first rules out missing parents and cycles in one pass.
    if (item.parentId !== null && !pointIds.has(item.parentId)) {
      issues.push(`Point ${item.id} must follow its parent ${item.parentId}.`);
    }
    pointIds.add(item.id);
    checkAppliesTo(item.appliesTo, `Point ${item.id}`);
  }

  for (const item of spec.papers) {
    checkAppliesTo(item.appliesTo, `Paper ${item.id}`);
    if (item.pointIds === 'all') continue;
    for (const pointId of item.pointIds) {
      if (!pointIds.has(pointId)) issues.push(`Paper ${item.id} covers unknown point ${pointId}.`);
    }
  }

  const weightings = spec.assessmentObjectives.map((objective) => objective.weightingPercent);
  if (weightings.length > 0 && weightings.every((value) => value !== undefined)) {
    const total = weightings.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.5)
      issues.push(`Assessment objective weightings total ${total}%, not 100%.`);
  }
  return issues;
}

export type SpecificationParseResult =
  { ok: true; specification: Specification } | { ok: false; issues: string[] };

export function parseSpecification(value: unknown): SpecificationParseResult {
  const parsed = specificationSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'specification'}: ${issue.message}`,
      ),
    };
  }
  const issues = semanticIssues(parsed.data);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, specification: parsed.data };
}

/** Builds a catalogue, rejecting invalid entries and duplicate specification ids. */
export function buildCatalogue(entries: readonly unknown[]): ReadonlyMap<string, Specification> {
  const catalogue = new Map<string, Specification>();
  for (const [index, entry] of entries.entries()) {
    const result = parseSpecification(entry);
    if (!result.ok)
      throw new Error(`Specification ${index} is invalid: ${result.issues.join(' ')}`);
    if (catalogue.has(result.specification.id)) {
      throw new Error(`Duplicate specification ${result.specification.id}.`);
    }
    catalogue.set(result.specification.id, result.specification);
  }
  return catalogue;
}

export {
  appliesToSelection,
  pointsForSelection,
  papersForSelection,
  paperPoints,
} from './selection';
