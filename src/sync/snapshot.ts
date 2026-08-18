// Snapshot wire helpers for P5. Keeping JSON and size accounting here keeps
// the cycle concerned with ordering and safety rather than string handling.

import type { BackupFile, Card, SessionHistoryEntry } from '../db/types';
import { isPreV22Backup, PRE_V22_BACKUP_MESSAGE, validateBackup } from '../db/portability';

/** Vercel Functions reject request bodies above 4.5 MB before the relay runs. */
export const SYNC_PLATFORM_BODY_LIMIT_BYTES = 4_500_000;

const ASSET_RE = /lacuna-asset:\/\/([a-f0-9]{64})/gi;

export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncPayloadError';
  }
}

export interface SnapshotSizeReport {
  plaintextBytes: number;
  transportBytes: number;
  limitBytes: number;
  courseNames: string[];
}

export class SyncSnapshotTooLargeError extends Error {
  readonly report: SnapshotSizeReport;

  constructor(report: SnapshotSizeReport) {
    super(formatSnapshotSizeError(report));
    this.name = 'SyncSnapshotTooLargeError';
    this.report = report;
  }
}

export function encodeSnapshot(snapshot: BackupFile): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot));
}

export function decodeSnapshot(bytes: Uint8Array): BackupFile {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SyncPayloadError('The relay returned an unreadable sync snapshot.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyncPayloadError('The relay returned invalid sync data.');
  }
  if (!validateBackup(parsed)) {
    throw new SyncPayloadError('The relay returned an invalid Lacuna snapshot.');
  }
  if (isPreV22Backup(parsed)) {
    throw new SyncPayloadError(PRE_V22_BACKUP_MESSAGE);
  }
  return parsed;
}

export function assertSnapshotSize(
  snapshot: BackupFile,
  transportBytes: number,
  limitBytes = SYNC_PLATFORM_BODY_LIMIT_BYTES,
): SnapshotSizeReport {
  const report: SnapshotSizeReport = {
    plaintextBytes: encodeSnapshot(snapshot).byteLength,
    transportBytes,
    limitBytes,
    courseNames: courseContributors(snapshot),
  };
  if (transportBytes > limitBytes) throw new SyncSnapshotTooLargeError(report);
  return report;
}

/** Compare snapshots as state, not as export timestamps or object-key order. */
export function snapshotsEquivalent(left: BackupFile, right: BackupFile): boolean {
  return canonicalJson(comparableSnapshot(left)) === canonicalJson(comparableSnapshot(right));
}

const OPTIONAL_COLLECTIONS = [
  'reviewHistory',
  'schedulingUnits',
  'coursePerformance',
  'schedulingPerformance',
  'courses',
  'lessons',
  'notes',
  'lessonCards',
  'lessonCardExposures',
  'lessonCompletions',
  'practiceNodes',
  'practiceMilestones',
  'courseAssessments',
  'revisionPlans',
  'sequences',
  'occlusions',
  'tombstones',
] as const;

function comparableSnapshot(snapshot: BackupFile): Record<string, unknown> {
  const result: Record<string, unknown> = { ...snapshot, exportedAt: 0 };
  for (const key of OPTIONAL_COLLECTIONS) {
    if (result[key] === undefined) result[key] = [];
  }
  return result;
}

function formatSnapshotSizeError(report: SnapshotSizeReport): string {
  const size = formatBytes(report.transportBytes);
  const limit = formatBytes(report.limitBytes);
  const names =
    report.courseNames.length > 0 ? ` Reduce content in: ${report.courseNames.join(', ')}.` : '';
  return `This sync snapshot is ${size}, above the ${limit} limit.${names}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

interface Contribution {
  id: string;
  name: string;
  bytes: number;
}

function courseContributors(snapshot: BackupFile): string[] {
  const courses = snapshot.courses ?? [];
  const contributions = new Map<string, Contribution>(
    courses.map((course) => [course.id, { id: course.id, name: course.name, bytes: 0 }]),
  );
  let unassignedBytes = 0;

  const add = (value: unknown, courseId: string | undefined): void => {
    const bytes = jsonBytes(value);
    const contribution = courseId ? contributions.get(courseId) : undefined;
    if (contribution) contribution.bytes += bytes;
    else unassignedBytes += bytes;
  };

  const lessons = snapshot.lessons ?? [];
  const lessonCourse = new Map(lessons.map((lesson) => [lesson.id, lesson.courseId]));
  const units = snapshot.schedulingUnits ?? [];
  const unitCourse = new Map(
    units.flatMap((unit) => (unit.courseId ? [[unit.id, unit.courseId] as const] : [])),
  );
  const cardCourse = (card: Pick<Card, 'courseId' | 'schedulingUnitId'>): string | undefined =>
    card.courseId ?? unitCourse.get(card.schedulingUnitId);

  for (const course of courses) add(course, course.id);
  for (const lesson of lessons) add(lesson, lesson.courseId);
  for (const note of snapshot.notes ?? []) add(note, lessonCourse.get(note.lessonId));
  for (const link of snapshot.lessonCards ?? []) add(link, lessonCourse.get(link.lessonId));
  for (const exposure of snapshot.lessonCardExposures ?? []) {
    add(exposure, lessonCourse.get(exposure.lessonId));
  }
  for (const completion of snapshot.lessonCompletions ?? []) {
    add(completion, lessonCourse.get(completion.lessonId));
  }

  const cards = snapshot.cards ?? [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  for (const card of cards) add(card, cardCourse(card));
  for (const review of snapshot.reviewHistory ?? []) {
    add(
      review,
      cardCourse(cardById.get(review.cardId) ?? { courseId: undefined, schedulingUnitId: '' }),
    );
  }
  for (const session of snapshot.sessionHistory ?? []) {
    add(session, sessionCourse(session, unitCourse, courses));
  }

  for (const node of snapshot.practiceNodes ?? []) add(node, node.courseId);
  for (const milestone of snapshot.practiceMilestones ?? []) add(milestone, milestone.courseId);
  for (const assessment of snapshot.courseAssessments ?? []) add(assessment, assessment.courseId);
  for (const plan of snapshot.revisionPlans ?? []) add(plan, plan.courseId);
  for (const sequence of snapshot.sequences ?? []) add(sequence, sequence.courseId);
  for (const occlusion of snapshot.occlusions ?? []) add(occlusion, occlusion.courseId);
  for (const unit of units) add(unit, unit.courseId ?? undefined);
  for (const row of snapshot.coursePerformance ?? []) add(row, row.courseId);
  for (const row of snapshot.schedulingPerformance ?? []) add(row, row.courseId);

  const assetOwners = assetOwnerMap(snapshot, lessonCourse, cardCourse);
  for (const asset of snapshot.assets ?? []) {
    const owners = assetOwners.get(asset.hash.toLowerCase());
    if (!owners || owners.size === 0) {
      unassignedBytes += jsonBytes(asset);
      continue;
    }
    const bytes = jsonBytes(asset);
    for (const courseId of owners) {
      const contribution = contributions.get(courseId);
      if (contribution) contribution.bytes += bytes;
    }
  }

  const names = [...contributions.values()]
    .filter((contribution) => contribution.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .map((contribution) => contribution.name);
  if (unassignedBytes > 0) names.push('other local data');
  return names;
}

function sessionCourse(
  session: SessionHistoryEntry,
  unitCourse: Map<string, string>,
  courses: Array<{ id: string }>,
): string | undefined {
  if (session.courseId && courses.some((course) => course.id === session.courseId))
    return session.courseId;
  if (session.schedulingUnitId) return unitCourse.get(session.schedulingUnitId);
  return unitCourse.get(session.deckId);
}

function assetOwnerMap(
  snapshot: BackupFile,
  lessonCourse: Map<string, string>,
  cardCourse: (card: Pick<Card, 'courseId' | 'schedulingUnitId'>) => string | undefined,
): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  const addReferences = (markdown: string, courseId: string | undefined): void => {
    if (!courseId) return;
    ASSET_RE.lastIndex = 0;
    for (const match of markdown.matchAll(ASSET_RE)) {
      const set = owners.get(match[1].toLowerCase()) ?? new Set<string>();
      set.add(courseId);
      owners.set(match[1].toLowerCase(), set);
    }
  };
  for (const card of snapshot.cards ?? [])
    addReferences(`${card.front}\n${card.back}`, cardCourse(card));
  for (const note of snapshot.notes ?? [])
    addReferences(note.content, lessonCourse.get(note.lessonId));
  for (const occlusion of snapshot.occlusions ?? []) {
    const set = owners.get(occlusion.assetHash.toLowerCase()) ?? new Set<string>();
    set.add(occlusion.courseId);
    owners.set(occlusion.assetHash.toLowerCase(), set);
  }
  return owners;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .map(sortKeys)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry !== undefined) sorted[key] = sortKeys(entry);
  }
  return sorted;
}
