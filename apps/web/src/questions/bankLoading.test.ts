import { expect, it, vi } from 'vitest';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';

const repository = vi.hoisted(() => ({
  loaded: vi.fn(),
}));

vi.mock('./bankRepository', () => {
  repository.loaded();
  return repository;
});

import { materialiseQuestionBank, parseQuestionBank, parseQuestionBankAsync } from './bank';

it('keeps parsing and materialisation independent of the lazy repository entry points', async () => {
  parseQuestionBank(familyExample);
  await parseQuestionBankAsync(familyExample);
  materialiseQuestionBank(familyExample, 'course');
  expect(repository.loaded).not.toHaveBeenCalled();
});
