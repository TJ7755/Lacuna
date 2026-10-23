import type { Table } from 'dexie';
import { db } from './schema';
import type { SharePayloadV2, SharePayloadV3, SharePayloadV4, SharePayloadV5, SharePayloadV6 } from './share';
import type { LineageIdMapping, PendingMergeReview } from './types';

type Payload = (SharePayloadV2 | SharePayloadV3 | SharePayloadV4 | SharePayloadV5 | SharePayloadV6) & {
  li: string;
  rv: number;
};

function integrityError(detail: string): never {
  throw new Error(
    `Course update integrity check failed: ${detail} Export a backup and restore intact course tracking or obtain a corrected course file before retrying.`,
  );
}

/** Validate globally before any writer runs. Only adopted source identities can repair membership. */
export async function prepareLineageMapping(
  payload: Payload,
  courseId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  if (mapping.id !== payload.li || mapping.courseId !== courseId) {
    integrityError('The lineage tracking row belongs to a different course.');
  }
  const registries = await db.lineageIdMappings.toArray();
  const check = async <T>(
    table: Table<T, string>,
    incoming: string[],
    known: string[],
    owner: (row: T) => Promise<string | null | undefined> | string | null | undefined,
    field: keyof LineageIdMapping,
  ): Promise<Map<string, T>> => {
    if (new Set(incoming).size !== incoming.length) {
      integrityError(`Duplicate ${table.name} source IDs.`);
    }
    const ids = [...new Set([...incoming, ...known])];
    const rows = await table.bulkGet(ids);
    const owners = await Promise.all(rows.map((row) => row ? owner(row) : undefined));
    const result = new Map<string, T>();
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (registries.some((registry) => registry.id !== payload.li &&
        (registry[field] as string[] | undefined)?.includes(id))) {
        integrityError(`${table.name} ID ${id} is claimed by another lineage.`);
      }
      const row = rows[index];
      if (!row) continue;
      if (owners[index] !== courseId) {
        integrityError(`${table.name} ID ${id} belongs to another course or has no course owner.`);
      }
      result.set(id, row);
    }
    return result;
  };
  const recover = (known: string[], snapshots: object, incoming: string[], stored: Map<string, unknown>) => {
    // Snapshot keys are retained publisher evidence, including rows removed upstream.
    // Unrecognised local rows absent from the payload must never become removals.
    return [...new Set([...known, ...Object.keys(snapshots), ...incoming.filter((id) => stored.has(id))])];
  };
  const lessons = payload.lessons.map((lesson) => {
    if (!lesson.i) integrityError('A lesson is missing its source ID.');
    return lesson.i;
  });
  const notes = payload.lessons.flatMap((lesson) => lesson.notes.map((note) => {
    if (!note.oi) integrityError('A note is missing its source ID.');
    return note.oi;
  }));
  const allCards = [...payload.lessons.flatMap((lesson) => lesson.cards), ...(payload.bankCards ?? [])];
  const cards = allCards.filter((card) => card.si === undefined && card.oc === undefined).map((card) => {
    if (!card.id) integrityError('A card is missing its source ID.');
    return card.id;
  });
  const lessonKnown = [...new Set([...mapping.lessonIds, ...Object.keys(mapping.lessonSnapshots)])];
  const noteKnown = [...new Set([...mapping.noteIds, ...Object.keys(mapping.noteSnapshots)])];
  const cardKnown = [...new Set([...mapping.cardIds, ...Object.keys(mapping.cardSnapshots)])];
  const storedLessons = await check(db.lessons, lessons, lessonKnown, (row) => row.courseId, 'lessonIds');
  const storedNotes = await check(db.notes, notes, noteKnown,
    async (row) => (await db.lessons.get(row.lessonId))?.courseId, 'noteIds');
  const storedCards = await check(db.cards, cards, cardKnown, (row) => row.courseId, 'cardIds');
  if ([...storedCards.values()].some((card) => card.sequenceItemId || card.occlusionRegionId)) {
    integrityError('An ordinary source card ID belongs to a generated card.');
  }
  mapping.lessonIds = recover(mapping.lessonIds, mapping.lessonSnapshots, lessons, storedLessons);
  mapping.noteIds = recover(mapping.noteIds, mapping.noteSnapshots, notes, storedNotes);
  mapping.cardIds = recover(mapping.cardIds, mapping.cardSnapshots, cards, storedCards);

  // These writers own their existing regeneration/conflict policies. Recovery must not
  // synthesise their baselines or promote unknown local rows into deletion membership.
  await check(db.sequences, (payload.sequences ?? []).map((row) => row.id), mapping.sequenceIds,
    (row) => row.courseId, 'sequenceIds');
  await check(db.occlusions, (payload.occlusions ?? []).map((row) => row.id), mapping.occlusionIds ?? [],
    (row) => row.courseId, 'occlusionIds');
  const generated = allCards.filter((card) => card.si !== undefined || card.oc !== undefined);
  const storedGenerated = await check(db.cards, generated.flatMap((card) => card.id ? [card.id] : []),
    [], (row) => row.courseId, 'cardIds');
  for (const card of generated) {
    const current = card.id ? storedGenerated.get(card.id) : undefined;
    if (current && (current.sequenceItemId !== card.si || current.occlusionRegionId !== card.oc)) {
      integrityError(`Generated Card ID ${card.id} has incompatible source ownership.`);
    }
  }
  await check(db.cards, (payload.links ?? []).map((link) => link.c).filter((id, index, ids) => ids.indexOf(id) === index),
    [], (row) => row.courseId, 'cardIds');
  if (payload.v === 2) {
    const concepts = await db.concepts.bulkGet(cards.filter((id) => !storedCards.has(id))
      .map((id) => `concept:lineage-card:${encodeURIComponent(id)}`));
    if (concepts.some(Boolean)) integrityError('A new source Card Concept ID is already in use.');
    return;
  }
  await check(db.concepts, payload.concepts.map((row) => row.id), mapping.conceptIds ?? [],
    (row) => row.scope === 'course' ? row.courseId : undefined, 'conceptIds');
  await check(db.questions, payload.questions.map((row) => row.id), mapping.questionIds ?? [],
    (row) => row.courseId, 'questionIds');
  await check(db.questionConcepts, payload.questions.map((row) => row.id), mapping.questionIds ?? [],
    (row) => row.courseId, 'questionIds');
  if (payload.v === 3) return;
  mapping.assessmentIds = [...new Set([...(mapping.assessmentIds ?? []), ...Object.keys(mapping.assessmentSnapshots ?? {})])];
  mapping.questionSetIds = [...new Set([...(mapping.questionSetIds ?? []), ...Object.keys(mapping.questionSetRevisions ?? {})])];
  await check(db.courseAssessments, (payload.exams ?? []).flatMap((row) => row.id ? [row.id] : []),
    mapping.assessmentIds ?? [], (row) => row.courseId, 'assessmentIds');
  const sets = await check(db.questionSets, payload.questionSets.map((row) => row.id), mapping.questionSetIds ?? [],
    (row) => row.courseId, 'questionSetIds');
  for (const id of sets.keys()) {
    if (mapping.questionSetRevisions?.[id] === undefined) {
      integrityError(`The last imported Question Set revision is missing for ${id}.`);
    }
  }
  if (payload.v === 5 || payload.v === 6) {
    mapping.questionSetPracticeNodeIds = [...new Set([...(mapping.questionSetPracticeNodeIds ?? []),
      ...Object.keys(mapping.questionSetPracticeNodeSnapshots ?? {})])];
    await check(db.practiceNodes, payload.questionSetPracticeNodes.map((row) => row.id),
      mapping.questionSetPracticeNodeIds ?? [], (row) => row.courseId, 'questionSetPracticeNodeIds');
  }
}

/** A pending decision is not authority to mutate an unrelated global ID. */
export async function assertLineageReviewIntegrity(
  review: PendingMergeReview,
  mapping: LineageIdMapping | undefined,
): Promise<LineageIdMapping> {
  const course = await db.courses.get(review.courseId);
  if (!mapping || mapping.id !== review.lineageId || mapping.courseId !== review.courseId ||
    course?.distributedCopy?.lineageId !== review.lineageId) {
    integrityError('Pending review tracking is missing or belongs to a different course.');
  }
  const diff = review.diff;
  for (const kind of ['lesson', 'note', 'card'] as const) {
    const ids = [...new Set([
      ...diff.updates[`${kind}s`].map((row) => row.id),
      ...diff.removals[`${kind}Ids`],
      ...diff.conflicts.filter((row) => row.kind === kind).map((row) => row.entityId),
    ])];
    if (ids.some((id) => !mapping[`${kind}Ids`].includes(id))) {
      integrityError(`Pending ${kind} decisions have no adopted source membership.`);
    }
    const owners = kind === 'lesson'
      ? (await db.lessons.bulkGet(ids)).map((row) => row?.courseId)
      : kind === 'card'
        ? (await db.cards.bulkGet(ids)).map((row) => row?.courseId)
        : await Promise.all((await db.notes.bulkGet(ids)).map(async (row) =>
          row ? (await db.lessons.get(row.lessonId))?.courseId ?? null : undefined));
    if (owners.some((owner) => owner !== undefined && owner !== review.courseId)) {
      integrityError(`A pending ${kind} decision belongs to another course.`);
    }
  }
  return mapping;
}
