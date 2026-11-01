import { db, makeId } from '../db/schema';
import { canEditLessons } from '../course/lessonViewMode';
import { clearTombstone } from '../db/mutationStamp';
import {
  materialiseValidatedQuestionBank,
  parseQuestionBankAsync,
  parseQuestionBank,
  sameBankContent,
  type QuestionBank,
} from './bankMaterialisation';
import { remapQuestionBankMetadata } from '@lacuna/core/questions/bankMetadata';
import { bankFingerprint, mapBankQuestions } from './generators/declarative';
import {
  parseQuestionSetRecord,
  type QuestionSetRecord,
} from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';

export async function importBank(value: unknown, courseId: string): Promise<QuestionSetRecord[]> {
  const bank = await parseQuestionBankAsync(value);
  const materialised = materialiseValidatedQuestionBank(bank, courseId, true);
  return db.transaction(
    'rw',
    [db.courses, db.concepts, db.questionSets, db.tombstones, db.lineageIdMappings],
    async (tx) => {
      const course = await db.courses.get(courseId);
      if (!course || course.archived) throw new Error('This Course is read-only.');
      const lockedCopy = course.distributedCopy?.locked === true;
      const lineage = lockedCopy
        ? await db.lineageIdMappings.get(course.distributedCopy!.lineageId)
        : undefined;
      if (!canEditLessons(course) && lineage?.courseId !== courseId) {
        throw new Error('This Course is read-only.');
      }
      const publisherSetIds = new Set(lockedCopy ? (lineage?.questionSetIds ?? []) : []);
      const now = Date.now();
      const courseSets = await db.questionSets.where('courseId').equals(courseId).toArray();
      const oldSets = courseSets.filter((set) => set.bank?.bankId === bank.bankId);
      const oldVersion = Math.max(0, ...oldSets.map((set) => set.bank!.bankVersion));
      if (bank.bankVersion < oldVersion)
        throw new Error('Cannot import an older Question bank version.');
      const previousConcepts = new Map(
        courseSets
          .filter((set) => set.bank?.courseCode === bank.courseCode)
          .flatMap((set) =>
            set.bank!.concepts.map(
              (concept) => [concept.sourceId ?? concept.id, concept.id] as const,
            ),
          ),
      );
      const authoredConcepts = await db.concepts.bulkGet(
        bank.concepts.map((concept) => concept.id),
      );
      const concepts = new Map(
        bank.concepts.map((concept, index) => [
          concept.id,
          previousConcepts.get(concept.id) ??
            (authoredConcepts[index]?.scope === 'course' &&
            authoredConcepts[index]?.courseId === courseId
              ? concept.id
              : `bankc-${bankFingerprint([courseId, bank.courseCode, concept.id])}`),
        ]),
      );
      const mapConcept = (id: string): string => {
        const mapped = concepts.get(id);
        if (!mapped) throw new Error(`Unknown bank Concept: ${id}.`);
        return mapped;
      };
      for (const concept of bank.concepts) {
        const id = mapConcept(concept.id);
        const existing = await db.concepts.get(id);
        if (existing && (existing.scope !== 'course' || existing.courseId !== courseId))
          throw new Error('Bank Concept identity collision.');
        if (!existing) {
          await db.concepts.add({
            id,
            scope: 'course',
            scopeKey: `course:${courseId}`,
            courseId,
            name: concept.name,
            provisional: false,
            createdAt: now,
            updatedAt: now,
          });
          await clearTombstone(tx, 'concepts', id);
        }
      }
      const references = new Map(
        materialised.map((set) => {
          const ids = new Set<string>();
          mapBankQuestions(
            set.questions,
            (text) => text,
            (id) => {
              ids.add(id);
              return id;
            },
          );
          return [set.id, ids] as const;
        }),
      );
      const allReferenced = new Set([...references.values()].flatMap((ids) => [...ids]));
      const imported: QuestionSetRecord[] = [];
      for (const set of materialised) {
        const previous = oldSets.find(
          (old) =>
            old.bank?.setId === set.bank!.setId &&
            old.bank?.variant?.index === set.bank!.variant?.index,
        );
        const existing = previous ?? (await db.questionSets.get(set.id));
        const publisherOwned =
          publisherSetIds.has(set.id) || Boolean(existing && publisherSetIds.has(existing.id));
        if (existing && existing.courseId !== courseId)
          throw new Error('Question bank set identity collision.');
        if (publisherOwned && !existing) {
          throw new Error('A publisher-owned Question Set cannot be replaced by a Question bank.');
        }
        if (existing && existing.bank?.bankId !== bank.bankId && !publisherOwned) {
          throw new Error('Question bank set identity collision.');
        }
        const retainedConcepts = bank.concepts
          .map((concept, sourceIndex) => ({ ...concept, sourceIndex }))
          .filter(
            (concept) =>
              references.get(set.id)!.has(concept.id) ||
              (imported.length === 0 && !allReferenced.has(concept.id)),
          );
        const metadata = remapQuestionBankMetadata(
          { ...set.bank!, concepts: retainedConcepts },
          mapConcept,
        );
        metadata.concepts = retainedConcepts.map((concept) => ({
          ...concept,
          id: mapConcept(concept.id),
          sourceId: concept.id,
        }));
        const content: QuestionSet = {
          ...set,
          id: existing?.id ?? set.id,
          questions: mapBankQuestions(set.questions, (text) => text, mapConcept),
          bank: metadata,
          lessonIds: existing?.lessonIds ?? [],
          assessmentIds: existing?.assessmentIds ?? [],
        };
        if (existing) {
          const {
            contentVersion: _v,
            contentRevisionId: _r,
            createdAt: _c,
            updatedAt: _u,
            ...oldContent
          } = existing;
          if (sameBankContent(content, oldContent)) {
            imported.push(existing);
            continue;
          }
          if (publisherOwned) {
            throw new Error('A publisher-owned Question Set cannot be updated by a Question bank.');
          }
          if (bank.bankVersion === existing.bank?.bankVersion)
            throw new Error('Changed Question bank content requires a higher bankVersion.');
        }
        const tombstone = await db.tombstones.get(['questionSets', content.id]);
        const updatedAt = Math.max(
          now,
          (existing?.updatedAt ?? -1) + 1,
          (tombstone?.deletedAt ?? -1) + 1,
        );
        const record = parseQuestionSetRecord({
          ...content,
          contentVersion: (existing?.contentVersion ?? 0) + 1,
          contentRevisionId: makeId(),
          createdAt: existing?.createdAt ?? updatedAt,
          updatedAt,
        });
        await db.questionSets.put(record);
        await clearTombstone(tx, 'questionSets', record.id);
        imported.push(record);
      }
      return imported;
    },
  );
}

export async function exportBank(courseId: string, bankId: string): Promise<QuestionBank> {
  const records = (await db.questionSets.where('courseId').equals(courseId).toArray())
    .map(parseQuestionSetRecord)
    .filter((set) => set.bank?.bankId === bankId);
  if (!records.length) throw new Error('Question bank not found.');
  const latest = Math.max(...records.map((set) => set.bank!.bankVersion));
  const current = records.filter((set) => set.bank!.bankVersion === latest);
  const first = current[0].bank!;
  const concepts = new Map(
    current.flatMap((set) => set.bank!.concepts.map((concept) => [concept.id, concept] as const)),
  );
  const mapConcept = (id: string) => concepts.get(id)?.sourceId ?? id;
  const bank: QuestionBank = {
    format: 'lacuna-question-bank',
    schemaVersion: 1,
    bankId,
    bankVersion: latest,
    courseCode: first.courseCode,
    concepts: [...concepts.values()]
      .sort((left, right) => (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0))
      .map((concept) => ({ id: concept.sourceId ?? concept.id, name: concept.name })),
    sets: [],
    families: [],
  };
  const families = new Set<string>();
  for (const record of current) {
    const metadata = record.bank!;
    if (metadata.family) {
      if (families.has(metadata.family.id)) continue;
      families.add(metadata.family.id);
      bank.families.push({
        ...metadata.family,
        template: {
          ...metadata.family.template,
          questions: mapBankQuestions(
            metadata.family.template.questions,
            (text) => text,
            mapConcept,
          ),
        },
      });
    } else
      bank.sets.push({
        id: metadata.setId,
        title: record.title,
        questions: mapBankQuestions(record.questions, (text) => text, mapConcept),
        source: metadata.source,
        blueprint: metadata.blueprint,
      });
  }
  return parseQuestionBank(bank);
}
