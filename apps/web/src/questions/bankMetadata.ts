import type { z } from 'zod';
import { questionBankMetadataSchema } from './bankSchema';

export type QuestionBankMetadata = z.infer<typeof questionBankMetadataSchema>;
export function parseQuestionBankMetadata(value: unknown): QuestionBankMetadata {
  const metadata = questionBankMetadataSchema.parse(value);
  if (Boolean(metadata.family) !== Boolean(metadata.variant))
    throw new Error('Family and variant metadata must appear together.');
  return metadata;
}

export function remapQuestionBankMetadata(
  metadata: QuestionBankMetadata,
  mapConceptId: (id: string) => string,
  mapNodeId: (id: string) => string = (id) => id,
): QuestionBankMetadata {
  const mapped = structuredClone(metadata);
  mapped.concepts = mapped.concepts.map((concept) => ({
    ...concept,
    id: mapConceptId(concept.id),
  }));
  if (mapped.family) {
    for (const question of mapped.family.template.questions) {
      question.id = mapNodeId(question.id);
      for (const part of question.parts) {
        part.id = mapNodeId(part.id);
        for (const subpart of part.subparts) subpart.id = mapNodeId(subpart.id);
      }
      const answers = [
        question.answer,
        ...question.parts.flatMap((part) => [
          part.answer,
          ...part.subparts.map((subpart) => subpart.answer),
        ]),
      ];
      for (const answer of answers) {
        if (!answer) continue;
        if (answer.response.kind === 'multiple-choice') {
          for (const option of answer.response.options) option.id = mapNodeId(option.id);
          answer.response.correctOptionIds = answer.response.correctOptionIds.map(mapNodeId);
        }
        answer.prerequisiteConceptIds = answer.prerequisiteConceptIds.map(mapConceptId);
        for (const allocation of answer.allocations) {
          allocation.id = mapNodeId(allocation.id);
          allocation.targetConceptIds = [mapConceptId(allocation.targetConceptIds[0])];
        }
      }
    }
  }
  return mapped;
}
