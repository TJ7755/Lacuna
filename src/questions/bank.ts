import { questionBankSchema, type QuestionBank } from './bankSchema';
import type { QuestionSetRecord } from './questionSetCodec';
import type { QuestionBankMetadata } from './bankMetadata';
import {
  bankFingerprint,
  canonicalBankJson,
  mapBankQuestions,
  materialiseDeclarativeFamily,
} from './generators/declarative';
import { validateQuestionSet, type QuestionSet } from './questionSets';

export type { QuestionBank } from './bankSchema';

function parseBankShape(value: unknown): QuestionBank {
  const bank = questionBankSchema.parse(value);
  if (!bank.sets.length && !bank.families.length)
    throw new Error('A Question bank must contain content.');
  if (new Set(bank.concepts.map((concept) => concept.id)).size !== bank.concepts.length)
    throw new Error('Duplicate bank Concept identity.');
  const ids = [...bank.sets, ...bank.families].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate bank set or family identity.');
  return bank;
}

function bankValidator(bank: QuestionBank): (set: QuestionSet) => void {
  const conceptIds = new Set(bank.concepts.map((concept) => concept.id));
  return (set) => {
    const issues = validateQuestionSet(set);
    if (issues.length)
      throw new Error(`Invalid Question bank: ${issues[0].code} at ${issues[0].path}.`);
    mapBankQuestions(
      set.questions,
      (text) => text,
      (id) => {
        if (!conceptIds.has(id)) throw new Error(`Unknown bank Concept: ${id}.`);
        return id;
      },
    );
  };
}

function auditFamily(
  bank: QuestionBank,
  family: QuestionBank['families'][number],
  validate: (set: QuestionSet) => void,
) {
  for (const variant of materialiseDeclarativeFamily(family))
    validate({
      ...variant,
      id: family.id,
      courseId: bank.courseCode,
      lessonIds: [],
      assessmentIds: [],
    });
}

export function parseQuestionBank(value: unknown): QuestionBank {
  const bank = parseBankShape(value);
  const validate = bankValidator(bank);
  for (const set of bank.sets)
    validate({ ...set, courseId: bank.courseCode, lessonIds: [], assessmentIds: [] });
  for (const family of bank.families) auditFamily(bank, family, validate);
  return bank;
}

/** Finish all audits before opening the import transaction, yielding between families. */
export async function parseQuestionBankAsync(value: unknown): Promise<QuestionBank> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const bank = parseBankShape(value);
  const validate = bankValidator(bank);
  for (let index = 0; index < bank.sets.length; index++) {
    validate({ ...bank.sets[index], courseId: bank.courseCode, lessonIds: [], assessmentIds: [] });
    if (index % 20 === 19) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  for (const family of bank.families) {
    auditFamily(bank, family, validate);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return bank;
}

export function materialiseValidatedQuestionBank(
  bank: QuestionBank,
  courseId: string,
  representativeOnly = false,
): QuestionSet[] {
  const base = {
    bankId: bank.bankId,
    bankVersion: bank.bankVersion,
    courseCode: bank.courseCode,
    concepts: bank.concepts,
  };
  const result: QuestionSet[] = [];
  const add = (
    id: string,
    title: string,
    questions: QuestionSet['questions'],
    metadata: Omit<QuestionBankMetadata, 'fingerprint'>,
  ) => {
    result.push({
      id: `banks-${bankFingerprint([courseId, bank.bankId, id])}`,
      courseId,
      title,
      lessonIds: [],
      assessmentIds: [],
      questions,
      bank: { ...metadata, fingerprint: bankFingerprint({ title, questions }) },
    });
  };
  for (const set of bank.sets)
    add(set.id, set.title, set.questions, {
      ...base,
      setId: set.id,
      source: set.source,
      blueprint: set.blueprint,
    });
  for (const family of bank.families) {
    for (const variant of materialiseDeclarativeFamily(
      family,
      representativeOnly ? 0 : undefined,
    )) {
      add(
        representativeOnly ? family.id : `${family.id}.${variant.index}`,
        variant.title,
        variant.questions,
        {
          ...base,
          setId: family.id,
          source: family.source,
          blueprint: family.blueprint,
          family,
          variant: { index: variant.index, parameters: variant.parameters },
        },
      );
    }
  }
  return result;
}

export function materialiseQuestionBank(
  value: unknown,
  courseId: string,
  representativeOnly = false,
): QuestionSet[] {
  return materialiseValidatedQuestionBank(parseQuestionBank(value), courseId, representativeOnly);
}

export function sameBankContent(left: unknown, right: unknown): boolean {
  return canonicalBankJson(left) === canonicalBankJson(right);
}

// Keep file-only tooling free of IndexedDB initialisation.
export async function importQuestionBank(value: unknown, courseId: string) {
  const { importBank } = await import('./bankRepository');
  return importBank(value, courseId);
}
export async function exportQuestionBank(courseId: string, bankId: string): Promise<QuestionBank> {
  const { exportBank } = await import('./bankRepository');
  return exportBank(courseId, bankId);
}

export { declarativeFamilyCapacity } from './generators/declarative';

export function resolveFamilyVariant(set: QuestionSetRecord, index: number): QuestionSetRecord {
  if (!set.bank?.family) throw new Error('Question Set is not a declarative family.');
  const variant = materialiseDeclarativeFamily(set.bank.family, index)[0];
  const sourceIds = new Map(
    set.bank.concepts.map((concept) => [concept.id, concept.sourceId ?? concept.id]),
  );
  const authoredQuestions = mapBankQuestions(
    variant.questions,
    (text) => text,
    (id) => sourceIds.get(id) ?? id,
  );
  return {
    ...structuredClone(set),
    title: variant.title,
    questions: variant.questions,
    bank: {
      ...structuredClone(set.bank),
      variant: { index, parameters: variant.parameters },
      fingerprint: bankFingerprint({ title: variant.title, questions: authoredQuestions }),
    },
  };
}
