import { expect, it, vi } from 'vitest';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';

const repository = vi.hoisted(() => ({
  loaded: vi.fn(),
  importBank: vi.fn(async () => []),
  exportBank: vi.fn(async () => familyExample),
}));

vi.mock('./bankRepository', () => {
  repository.loaded();
  return repository;
});

import {
  declarativeFamilyCapacity,
  exportQuestionBank,
  importQuestionBank,
  materialiseQuestionBank,
  parseQuestionBank,
  parseQuestionBankAsync,
} from './bank';

it('keeps parsing and materialisation independent of the lazy repository entry points', async () => {
  const bank = parseQuestionBank(familyExample);
  expect(bank).toEqual(familyExample);
  expect(await parseQuestionBankAsync(familyExample)).toEqual(familyExample);
  const sets = materialiseQuestionBank(familyExample, 'course');
  expect(sets).toHaveLength(declarativeFamilyCapacity(bank.families[0]));
  expect(repository.loaded).not.toHaveBeenCalled();

  expect(await importQuestionBank(familyExample, 'course')).toEqual([]);
  expect(repository.importBank).toHaveBeenCalledWith(familyExample, 'course');
  expect(repository.loaded).toHaveBeenCalledTimes(1);

  expect(await exportQuestionBank('course', familyExample.bankId)).toEqual(familyExample);
  expect(repository.exportBank).toHaveBeenCalledWith('course', familyExample.bankId);
  expect(repository.loaded).toHaveBeenCalledTimes(1);
});
