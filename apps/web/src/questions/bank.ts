import type { QuestionBank } from '@lacuna/core/questions/bankSchema';

export type { QuestionBank } from '@lacuna/core/questions/bankSchema';
export {
  declarativeFamilyCapacity,
  materialiseQuestionBank,
  materialiseValidatedQuestionBank,
  parseQuestionBank,
  parseQuestionBankAsync,
  resolveFamilyVariant,
  sameBankContent,
} from './bankMaterialisation';

// Keep file-only tooling free of IndexedDB initialisation.
export async function importQuestionBank(value: unknown, courseId: string) {
  const { importBank } = await import('./bankRepository');
  return importBank(value, courseId);
}
export async function exportQuestionBank(courseId: string, bankId: string): Promise<QuestionBank> {
  const { exportBank } = await import('./bankRepository');
  return exportBank(courseId, bankId);
}
