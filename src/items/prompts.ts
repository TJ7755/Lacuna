import { markSchemeSyntaxSpecification } from './markSchemeCompiler';

export const MAX_BATCH_ITEMS = 20;
export const BATCH_OUTPUT_START = '<<<LACUNA_ITEMS_V1>>>';
export const BATCH_OUTPUT_END = '<<<END_LACUNA_ITEMS_V1>>>';

export interface BatchGenerationPromptInput {
  notes: string;
  topic: string;
  level: string;
  itemCount: number;
  round?: number;
}

export function buildMarkSchemeDraftPrompt(question: string): string {
  return [
    'Draft a Lacuna v1 mark scheme for the question below.',
    'Return only the mark-scheme lines, without a Markdown fence or explanation.',
    'Award marks for meaningful intermediate steps as well as the final answer.',
    '',
    'Question:',
    question.trim(),
    '',
    'Mark-scheme syntax:',
    markSchemeSyntaxSpecification(),
  ].join('\n');
}

export function buildBatchGenerationPrompt(input: BatchGenerationPromptInput): string {
  const itemCount = Math.min(MAX_BATCH_ITEMS, Math.max(1, Math.trunc(input.itemCount) || 1));
  const round = Math.max(1, Math.trunc(input.round ?? 1) || 1);
  const continuation =
    round > 1
      ? `This is continuation round ${round}. Produce the next ${itemCount} items without repeating earlier rounds.`
      : `Produce at most ${itemCount} items in this round.`;

  return [
    'Create a batch of Lacuna v1 numeric and working items from the lesson notes below.',
    'First decide whether anything material is ambiguous. If so, ask no more than three concise clarifying questions and wait for the answers. Otherwise produce the output immediately.',
    continuation,
    'Keep this batch within one lesson and topic. Prefer fewer strong items to padded repetition.',
    '',
    `Topic: ${input.topic.trim()}`,
    `Level: ${input.level.trim()}`,
    `Requested items: ${itemCount}`,
    `Round: ${round}`,
    '',
    'Lesson notes:',
    input.notes.trim(),
    '',
    'Mark-scheme syntax for working items:',
    markSchemeSyntaxSpecification(),
    '',
    'When ready, return exactly one JSON object between these delimiter lines, with no Markdown fence:',
    BATCH_OUTPUT_START,
    '{',
    '  "version": 1,',
    '  "items": [',
    '    {',
    '      "kind": "working",',
    '      "question": "Question text",',
    '      "scheme": "[1] method :: waypoint expression\\n[1] answer :: equals :: 4",',
    '      "fixtures": [{ "studentAnswer": ["working line", "4"], "expectedMarks": 2 }]',
    '    },',
    '    {',
    '      "kind": "numeric",',
    '      "question": "Question text",',
    '      "answer": { "kind": "exact", "value": "4" }',
    '    }',
    '  ]',
    '}',
    BATCH_OUTPUT_END,
    'Use valid JSON. Keep scheme newlines escaped inside JSON strings. Include at least one fixture for every working item.',
  ].join('\n');
}
