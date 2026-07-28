import { markSchemeSyntaxSpecification } from './markSchemeCompiler';

export const MAX_BATCH_ITEMS = 20;
export const BATCH_OUTPUT_START = '<<<LACUNA_ITEMS_V1>>>';
export const BATCH_OUTPUT_END = '<<<END_LACUNA_ITEMS_V1>>>';

export interface BatchGenerationPromptInput {
  notes: string;
  topic: string;
  level: string;
  maxItems?: number;
  conceptsPerItem?: number;
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
  const maxItems = input.maxItems
    ? Math.min(MAX_BATCH_ITEMS, Math.max(1, Math.trunc(input.maxItems) || 1))
    : undefined;
  const conceptsPerItem = input.conceptsPerItem
    ? Math.max(1, Math.trunc(input.conceptsPerItem) || 1)
    : undefined;
  const generationConstraints = [
    conceptsPerItem
      ? `Target concept density: ${conceptsPerItem} atomic concept${conceptsPerItem === 1 ? '' : 's'} per item. Combine concepts only when they form one coherent retrieval target.`
      : 'Choose an appropriate number of atomic concepts per item. Do not combine unrelated concepts into one retrieval target.',
    maxItems
      ? `Requested maximum items: ${maxItems}.`
      : 'Choose the number of items needed for useful coverage without padding.',
    `Never return more than ${MAX_BATCH_ITEMS} items in one response.`,
  ];

  return [
    'Create a batch of Lacuna v1 numeric and working items from the lesson notes below.',
    'First decide whether anything material is ambiguous. If so, ask no more than three concise clarifying questions and wait for the answers. Otherwise produce the output immediately.',
    ...generationConstraints,
    'Keep this batch within one lesson and topic. Prefer fewer strong items to padded repetition.',
    '',
    `Topic: ${input.topic.trim()}`,
    `Level: ${input.level.trim()}`,
    `Concepts per item: ${conceptsPerItem ?? 'model-selected'}`,
    `Requested maximum items: ${maxItems ?? 'model-selected'}`,
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
