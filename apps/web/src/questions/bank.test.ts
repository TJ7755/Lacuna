import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import staticExample from '../../../../docs/question-bank/examples/static-multipart.json';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';
import { createCourse } from '../db/repository';
import { db } from '../db/schema';
import { importLineageFirstTime, mergeLineageUpdate } from '../db/mergeImport';
import type { SharePayloadV6 } from '../db/share';
import {
  declarativeFamilyCapacity,
  exportQuestionBank,
  importQuestionBank,
  materialiseQuestionBank,
  parseQuestionBank,
  resolveFamilyVariant,
} from './bank';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import { listConceptPractice, startConceptPractice } from './conceptPractice';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function publishedBiologyPayload(overrides: Partial<SharePayloadV6> = {}): SharePayloadV6 {
  return {
    v: 6,
    questionSetPracticeNodes: [],
    by: 'Biology publisher',
    at: 1_000,
    course: { n: 'Biology', o: 0, c: 1_000, e: 2_000_000, um: 'open' },
    lessons: [
      {
        i: 'published-cells',
        n: 'Cells',
        notes: [{ oi: 'published-cell-note', n: 'Cell', c: 'A cell is a basic unit of life.' }],
        cards: [
          {
            id: 'published-cell-card',
            k: 0,
            f: 'What is a cell?',
            b: 'A basic unit of life.',
            co: 'density',
          },
        ],
      },
    ],
    concepts: [{ id: 'density', n: 'Publisher-owned Density concept' }],
    questions: [],
    questionSets: [],
    li: 'published-biology-lineage',
    rv: 1,
    ...overrides,
  };
}

describe('portable Question banks', () => {
  it.each([staticExample, familyExample])(
    'preserves criterion technique tags through bank import, materialisation and export: $bankId',
    async (example) => {
      const bank = parseQuestionBank(example);
      const template = bank.sets[0] ?? bank.families[0].template;
      const question = template.questions[0];
      const answer = question.answer ?? question.parts[0].answer!;
      const tags = {
        taxonomyId: 'science-explanations' as const,
        taxonomyVersion: 1 as const,
        techniqueIds: ['causal-link' as const],
        provenance: { source: 'author' as const },
      };
      answer.allocations[0].techniqueTags = tags;
      const course = await createCourse('Pilot');

      const [set] = await importQuestionBank(bank, course.id);
      const materialised = set.questions[0];
      expect(
        (materialised.answer ?? materialised.parts[0].answer!).allocations[0].techniqueTags,
      ).toEqual(tags);
      expect(await exportQuestionBank(course.id, bank.bankId)).toEqual(bank);
      expect(await importQuestionBank(bank, course.id)).toEqual([set]);
    },
  );

  it('imports the public bank into a locked published course while retaining its lineage and content', async () => {
    const { course } = await importLineageFirstTime(publishedBiologyPayload());
    const card = await db.cards.get('published-cell-card');
    const lesson = await db.lessons.get('published-cells');
    const mapping = await db.lineageIdMappings.get('published-biology-lineage');

    const [set] = await importQuestionBank(staticExample, course.id);

    expect(set.bank?.bankId).toBe(staticExample.bankId);
    expect((await db.courses.get(course.id))?.distributedCopy).toMatchObject({
      lineageId: 'published-biology-lineage',
      revision: 1,
      locked: true,
    });
    expect(await db.lineageIdMappings.get('published-biology-lineage')).toEqual(mapping);
    expect(await db.cards.get('published-cell-card')).toEqual(card);
    expect(await db.lessons.get('published-cells')).toEqual(lesson);
    expect(await db.concepts.get('density')).toMatchObject({
      courseId: course.id,
      scope: 'course',
      name: 'Publisher-owned Density concept',
    });
    expect(set.questions[0].parts[0].answer?.allocations[0].targetConceptIds).toEqual(['density']);

    const [unchanged] = await importQuestionBank(staticExample, course.id);
    expect(unchanged).toEqual(set);
    expect(await exportQuestionBank(course.id, staticExample.bankId)).toEqual(staticExample);

    const revisedBank = structuredClone(staticExample);
    revisedBank.bankVersion++;
    revisedBank.sets[0].title += ' revised';
    const [revised] = await importQuestionBank(revisedBank, course.id);
    expect(revised.id).toBe(set.id);
    expect(revised.contentVersion).toBe(set.contentVersion + 1);

    const sameNameBank = structuredClone(staticExample);
    sameNameBank.bankId = 'biology-same-name-supplement';
    sameNameBank.concepts[0] = {
      id: 'density-from-supplement',
      name: 'Publisher-owned Density concept',
    };
    for (const question of sameNameBank.sets[0].questions) {
      for (const part of question.parts) {
        for (const allocation of part.answer?.allocations ?? []) {
          allocation.targetConceptIds = ['density-from-supplement'];
        }
      }
    }
    const [sameNameSet] = await importQuestionBank(sameNameBank, course.id);
    const supplementalConceptId =
      sameNameSet.questions[0].parts[0].answer!.allocations[0].targetConceptIds[0];
    expect(supplementalConceptId).not.toBe('density');
    expect(await db.concepts.get(supplementalConceptId)).toMatchObject({
      scope: 'course',
      courseId: course.id,
      name: 'Publisher-owned Density concept',
    });
    expect((await db.concepts.get('density'))?.name).toBe('Publisher-owned Density concept');

    await mergeLineageUpdate(course.id, publishedBiologyPayload({ at: 2_000, rv: 2 }));
    expect((await db.courses.get(course.id))?.distributedCopy).toMatchObject({
      lineageId: 'published-biology-lineage',
      revision: 2,
      locked: true,
    });
    expect(await db.questionSets.get(set.id)).toEqual(revised);
    expect(await db.questionSets.get(sameNameSet.id)).toEqual(sameNameSet);
    expect(await db.concepts.get(supplementalConceptId)).toBeDefined();
    expect((await db.lineageIdMappings.get('published-biology-lineage'))?.questionSetIds).toEqual(
      [],
    );
    expect(await db.cards.get('published-cell-card')).toEqual(card);
    expect(await db.lessons.get('published-cells')).toEqual(lesson);
  });

  it('rejects bank imports into an archived published course', async () => {
    const { course } = await importLineageFirstTime(publishedBiologyPayload());
    await db.courses.update(course.id, { archived: true });

    await expect(importQuestionBank(staticExample, course.id)).rejects.toThrow(
      'This Course is read-only.',
    );
  });

  it('allows a no-op bank read but rejects a changed bank that targets a publisher-owned set', async () => {
    const { course } = await importLineageFirstTime(publishedBiologyPayload());
    const [publisherSet] = await importQuestionBank(staticExample, course.id);
    const persistedId = 'publisher-owned-bank-set';
    const persistedPublisherSet = { ...publisherSet, id: persistedId };
    await db.questionSets.delete(publisherSet.id);
    await db.questionSets.put(persistedPublisherSet);
    const mapping = (await db.lineageIdMappings.get('published-biology-lineage'))!;
    await db.lineageIdMappings.put({
      ...mapping,
      questionSetIds: [persistedId],
      questionSetRevisions: { [persistedId]: publisherSet.contentRevisionId },
    });

    const [unchanged] = await importQuestionBank(staticExample, course.id);
    expect(unchanged).toEqual(persistedPublisherSet);

    const revisedBank = structuredClone(staticExample);
    revisedBank.bankVersion++;
    revisedBank.sets[0].title += ' publisher collision';
    await expect(importQuestionBank(revisedBank, course.id)).rejects.toThrow(
      'publisher-owned Question Set',
    );
    expect(await db.questionSets.get(persistedId)).toEqual(persistedPublisherSet);
    expect(await db.questionSets.get(publisherSet.id)).toBeUndefined();
  });

  it('validates static multipart marks and requires exactly one primary Concept per criterion', () => {
    expect(parseQuestionBank(staticExample).sets[0].questions[0].parts).toHaveLength(2);
    const invalid = structuredClone(staticExample);
    invalid.sets[0].questions[0].parts[0].answer.allocations[0].targetConceptIds.push('density');
    expect(() => parseQuestionBank(invalid)).toThrow();
    const unknown = structuredClone(staticExample);
    unknown.sets[0].questions[0].parts[0].answer.allocations[0].targetConceptIds = ['unknown'];
    expect(() => parseQuestionBank(unknown)).toThrow('Unknown bank Concept');
  });

  it('materialises deterministic numeric novelty with coherent criteria and explanations', () => {
    const sets = materialiseQuestionBank(familyExample, 'course');
    expect(sets).toEqual(materialiseQuestionBank(familyExample, 'course'));
    expect(sets).toHaveLength(6);
    expect(new Set(sets.map((set) => set.bank!.fingerprint)).size).toBe(6);
    for (const set of sets) {
      const { mass, volume } = set.bank!.variant!.parameters;
      expect(set.questions[0].prompt).toContain(`mass ${mass} g and volume ${volume} cm³`);
      expect(set.questions[0].answer!.allocations[0].criterion).toBe(
        `Density = ${mass} ÷ ${volume} = ${mass / volume} g/cm³.`,
      );
    }
  });

  it('rejects executable input, invalid arithmetic, ineffective parameters and oversized families', () => {
    const bad = structuredClone(familyExample);
    bad.families[0].derived[0].op = 'eval';
    expect(() => parseQuestionBank(bad)).toThrow();
    bad.families[0].derived[0].op = '/';
    bad.families[0].parameters.volume = [0];
    expect(() => parseQuestionBank(bad)).toThrow('Division by zero');
    const duplicate = structuredClone(familyExample);
    duplicate.families[0].template.questions[0].prompt = 'An unchanged prompt';
    expect(() => parseQuestionBank(duplicate)).toThrow('distinct Question presentations');
    const large = structuredClone(familyExample);
    large.families[0].parameters.mass = Array.from({ length: 100 }, (_, index) => index + 1);
    large.families[0].parameters.volume = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(() => parseQuestionBank(large)).toThrow('at most 1000');
  });

  it('imports and exports original static and family authoring without touching old receipts', async () => {
    const course = await createCourse('Physics');
    const staticSets = await importQuestionBank(staticExample, course.id);
    expect(await exportQuestionBank(course.id, staticExample.bankId)).toEqual(staticExample);
    const [set] = await importQuestionBank(familyExample, course.id);
    expect(await db.questionSets.count()).toBe(staticSets.length + 1);
    expect(await exportQuestionBank(course.id, familyExample.bankId)).toEqual(familyExample);
    expect(resolveFamilyVariant(set, 0).bank!.fingerprint).toBe(set.bank!.fingerprint);
    expect(resolveFamilyVariant(set, 5).questions[0].prompt).not.toBe(set.questions[0].prompt);
    expect(resolveFamilyVariant(set, 5).id).toBe(set.id);
    expect(declarativeFamilyCapacity(set.bank!.family!)).toBe(6);
    const attempt = await startQuestionSetAttempt(set.id, 'practice', Date.now());
    const original = structuredClone(attempt);
    const changed = structuredClone(familyExample);
    changed.bankVersion++;
    changed.families[0].template.questions[0].prompt += ' Give units.';
    const [updated] = await importQuestionBank(changed, course.id);
    expect(updated.id).toBe(set.id);
    expect(updated.contentVersion).toBe(set.contentVersion + 1);
    expect(updated.createdAt).toBe(set.createdAt);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(original);
    expect((await importQuestionBank(changed, course.id))[0]).toEqual(updated);
    await expect(importQuestionBank(familyExample, course.id)).rejects.toThrow('older');
  });

  it('rolls back Concepts when a later colliding set prevents import', async () => {
    const course = await createCourse('Physics');
    const [set] = materialiseQuestionBank(staticExample, course.id);
    await db.questionSets.put({
      ...set,
      bank: undefined,
      contentVersion: 1,
      contentRevisionId: 'unrelated',
      createdAt: 1,
      updatedAt: 1,
    });
    await expect(importQuestionBank(staticExample, course.id)).rejects.toThrow('collision');
    expect(await db.concepts.count()).toBe(0);
    expect((await db.questionSets.get(set.id))!.contentRevisionId).toBe('unrelated');
  });

  it('stores 80 thousand-variant families and 1300 parts in 210 compact records', async () => {
    const course = await createCourse('Physics');
    const bank = structuredClone(familyExample);
    const family = bank.families[0];
    family.parameters.mass = Array.from({ length: 100 }, (_, index) => index + 1);
    family.parameters.volume = Array.from({ length: 10 }, (_, index) => index + 1);
    bank.families = Array.from({ length: 80 }, (_, index) => ({
      ...structuredClone(family),
      id: `density-${index}`,
    }));
    const staticBank = structuredClone(staticExample);
    const concepts = Array.from({ length: 1300 }, (_, index) => ({
      id: `static-concept-${index}`,
      name: `Static Concept ${index}`,
    }));
    const sets = Array.from({ length: 130 }, (_, setIndex) => {
      const set = structuredClone(staticBank.sets[0]);
      set.id = `static-${setIndex}`;
      set.questions[0].parts = Array.from({ length: 10 }, (_, partIndex) => {
        const part = structuredClone(staticBank.sets[0].questions[0].parts[0]);
        part.id = `part-${partIndex}`;
        part.answer.allocations[0].id = `mark-${partIndex}`;
        part.answer.allocations[0].targetConceptIds = [concepts[setIndex * 10 + partIndex].id];
        return part;
      });
      return set;
    });
    const scaled = { ...bank, concepts: [...bank.concepts, ...concepts], sets };
    const imported = await importQuestionBank(scaled, course.id);
    expect(imported).toHaveLength(210);
    expect(await db.questionSets.count()).toBe(210);
    const bytes = new TextEncoder().encode(
      JSON.stringify(await db.questionSets.toArray()),
    ).byteLength;
    expect(bytes).toBeLessThan(2_000_000);
    const practice = await listConceptPractice(course.id);
    expect(practice).toHaveLength(1301);
    await startConceptPractice(course.id, imported[130].bank!.concepts[0].id);
    expect((await exportQuestionBank(course.id, scaled.bankId)).concepts).toEqual(scaled.concepts);
    expect(declarativeFamilyCapacity(imported[130].bank!.family!)).toBe(1000);
    const last = resolveFamilyVariant(imported[130], 999);
    expect(last.bank!.variant).toEqual({ index: 999, parameters: { mass: 100, volume: 10 } });
    expect(last.questions[0].answer!.allocations[0].criterion).toContain('= 10 g/cm³');
  }, 30000);
});

it('shares stable course Concepts across separate bank shards', async () => {
  const course = await createCourse('Physics');
  const [first] = await importQuestionBank(familyExample, course.id);
  const shard = { ...structuredClone(familyExample), bankId: 'another-shard' };
  const [second] = await importQuestionBank(shard, course.id);
  expect(second.questions[0].answer!.allocations[0].targetConceptIds).toEqual(
    first.questions[0].answer!.allocations[0].targetConceptIds,
  );
  expect(await db.concepts.where('courseId').equals(course.id).count()).toBe(1);
  const otherCourse = await createCourse('Other Physics');
  const [other] = await importQuestionBank(shard, otherCourse.id);
  expect(other.questions[0].answer!.allocations[0].targetConceptIds).not.toEqual(
    first.questions[0].answer!.allocations[0].targetConceptIds,
  );
});

it('accepts option-only generated presentations while rejecting feedback-only variation', () => {
  const bank = parseQuestionBank(familyExample);
  const family = bank.families[0];
  family.parameters = { mass: [12, 24], volume: [2] };
  const question = family.template.questions[0];
  question.prompt = 'Choose the displayed mass.';
  question.answer!.response = {
    kind: 'multiple-choice',
    selection: 'single',
    options: [
      { id: 'mass', content: '{{mass}} g' },
      { id: 'other', content: '100 g' },
    ],
    correctOptionIds: ['mass'],
  };
  expect(materialiseQuestionBank(bank, 'course')).toHaveLength(2);
  question.answer!.response.options[0].content = '12 g';
  expect(() => parseQuestionBank(bank)).toThrow(/distinct.*presentations/i);
});
