import { markSchemeSyntaxSpecification } from './markSchemeCompiler';

export const BATCH_OUTPUT_START = '<<<LACUNA_QUESTIONS_V2>>>';
export const BATCH_OUTPUT_END = '<<<END_LACUNA_QUESTIONS_V2>>>';

export interface BatchGenerationPromptInput {
  notes: string;
  topic: string;
  level: string;
  examBoard?: string;
  specification?: string;
  maxItems?: number;
}

export interface ItemRevisionPromptInput {
  itemJson: string;
  scheme?: string;
  failingFixture?: unknown;
  complaint: string;
  validationErrors?: string[];
}

const ITEM_TYPE_CONTRACT = [
  'Item-type contract:',
  '- Use `numeric` only when the answer evaluates to a constant scalar containing no variables, such as 12, sqrt(2) or pi/4.',
  '- A numeric answer must not be an equation, formula, definition, derivation or prose. If any variable or equals sign remains, it is not numeric.',
  '- Use `working` when the expected answer contains variables or an equals sign, including questions that ask the learner to recall or state a formula. Supply a mark scheme and at least one passing fixture.',
  '- If the notes support neither a scalar numeric answer nor meaningful machine-checkable working, omit the item. Never force coverage by misclassifying it.',
  '- Before returning the JSON, check every numeric answer. If it contains a variable or equals sign, change the item to working or omit it.',
].join('\n');

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
  const maxItems = input.maxItems ? Math.max(1, Math.trunc(input.maxItems) || 1) : undefined;
  const generationConstraints = [
    'Give every Question exactly one primary target Concept: the Concept principally practised by a successful answer.',
    'List any prerequisite Concepts separately. Never repeat the target as a prerequisite.',
    maxItems
      ? `Requested maximum items: ${maxItems}.`
      : 'Choose the number of items needed for useful coverage without padding.',
  ];

  return [
    'Create a batch of Lacuna v2 fixed numeric and working Questions from the lesson notes below.',
    'First decide whether anything material is ambiguous. If so, ask no more than three concise clarifying questions and wait for the answers. Otherwise produce the output immediately.',
    ...generationConstraints,
    'Generate durable concept checks, not a disposable worksheet of arbitrary-number exercises. A working item must test a reusable method, relationship or derivation from the notes.',
    'For algebra, prefer symbolic general forms such as deriving the quadratic formula from ax^2 + bx + c = 0 or completing the square generally; do not invent custom coefficients merely to produce another practice question.',
    'Keep this batch within one lesson and topic. Prefer fewer strong items to padded repetition.',
    '',
    ITEM_TYPE_CONTRACT,
    '',
    `Topic: ${input.topic.trim()}`,
    `Level: ${input.level.trim()}`,
    ...(input.examBoard?.trim() ? [`Exam board: ${input.examBoard.trim()}`] : []),
    ...(input.specification?.trim() ? [`Specification: ${input.specification.trim()}`] : []),
    `Requested maximum items: ${maxItems ?? 'model-selected'}`,
    '',
    'Lesson notes:',
    input.notes.trim(),
    '',
    'Mark-scheme syntax for working items:',
    markSchemeSyntaxSpecification(),
    '',
    'Answer-shape rules:',
    '- One answer means one value. A numeric answer and an equals criterion each take a single',
    '  constant expression: no variables, and at most one = sign.',
    '- A multi-variable solution is therefore several criteria, not one. Write',
    '  "[1] x :: equals :: 6" and "[1] y :: equals :: 4", never "[1] answer :: equals :: x=6,y=4".',
    '- Ask a numeric item for one named quantity ("give the value of x"), not for a coordinate',
    '  pair or a full solution set.',
    '',
    'Working-fixture rules:',
    '- Every fixture must actually earn its expectedMarks when checked against the scheme.',
    '- For a waypoint criterion, include the same mathematical expression or an algebraically equivalent expression as a fixture line.',
    '- For an equals criterion, use the answer expression itself as a fixture line.',
    '- Keep mathematical fixture lines machine-readable: use only numbers, variables, operators, brackets, =, abs and sqrt.',
    '- Do not add prose labels or units to mathematical fixture lines. Write "140", not "New quantity = 140 units".',
    '- A contains criterion is the only exception: its fixture line may be prose containing the required text.',
    '',
    'When ready, return exactly one JSON object between these delimiter lines, with no Markdown fence:',
    BATCH_OUTPUT_START,
    '{',
    '  "version": 2,',
    '  "items": [',
    '    {',
    '      "kind": "working",',
    '      "question": "Complete the square for x^2 + bx + c = 0 in general form.",',
    '      "explanation": "Move c, then add b^2/4 to both sides to form a perfect square.",',
    '      "targetConcept": "Complete the square in general form",',
    '      "prerequisiteConcepts": ["Expand a squared binomial"],',
    '      "scheme": "[1] isolate :: x^2 + b*x = -c\\n[1] square :: (x + b/2)^2 = b^2/4 - c",',
    '      "fixtures": [{ "studentAnswer": ["x^2 + b*x = -c", "(x + b/2)^2 = b^2/4 - c"], "expectedMarks": 2 }]',
    '    },',
    '    {',
    '      "kind": "numeric",',
    '      "question": "Question text",',
    '      "explanation": "A concise worked solution that explains why the answer is correct.",',
    '      "targetConcept": "One primary skill practised",',
    '      "prerequisiteConcepts": [],',
    '      "answer": { "kind": "exact", "value": "4" }',
    '    }',
    '  ]',
    '}',
    BATCH_OUTPUT_END,
    'Use valid JSON. Keep scheme newlines escaped inside JSON strings. Include at least one passing fixture for every working item.',
  ].join('\n');
}

export interface BatchRevisionPromptInput {
  items: Array<{ itemJson: string; validationErrors: string[] }>;
  complaint?: string;
}

export function buildBatchRevisionPrompt(input: BatchRevisionPromptInput): string {
  const count = input.items.length;
  const plural = count === 1 ? '' : 's';

  return [
    `Revise the ${count} Lacuna v2 Question${plural} below in response to the validation evidence.`,
    'Preserve each learning objective. Fix only the reported problems.',
    `Return exactly ${count} item${plural}, in the same order as they appear below. Do not add,`,
    'merge, drop or reorder items, and do not revise an item that reports no problem.',
    'For a working item, keep the mark scheme within the supplied v1 grammar and make every',
    'fixture earn its declared expectedMarks.',
    '',
    ...(input.complaint?.trim()
      ? ['Tutor complaint (applies to all of them):', input.complaint.trim(), '']
      : []),
    'Mark-scheme syntax:',
    markSchemeSyntaxSpecification(),
    '',
    ...input.items.flatMap((item, index) => [
      `--- Item ${index + 1} of ${count} ---`,
      'Validation feedback:',
      item.validationErrors.length
        ? item.validationErrors.join('\n')
        : 'No validation error was reported.',
      'Current item JSON:',
      item.itemJson.trim(),
      '',
    ]),
    'Return one JSON object between these delimiter lines, with no Markdown fence or explanation:',
    BATCH_OUTPUT_START,
    '{',
    '  "version": 2,',
    `  "items": [ the ${count} revised item${plural}, in the original order ]`,
    '}',
    BATCH_OUTPUT_END,
  ].join('\n');
}

export function buildItemRevisionPrompt(input: ItemRevisionPromptInput): string {
  return [
    'Revise one Lacuna v2 Question in response to the tutor complaint and validation evidence below.',
    'Preserve the learning objective. Fix the reported problem without creating additional items or unrelated variants.',
    'For a working item, keep the mark scheme within the supplied v1 grammar and make every fixture earn its declared expectedMarks.',
    '',
    ITEM_TYPE_CONTRACT,
    '',
    'Tutor complaint:',
    input.complaint.trim(),
    '',
    'Validation feedback:',
    input.validationErrors?.length
      ? input.validationErrors.join('\n')
      : 'No validation error was reported.',
    '',
    'Current mark scheme:',
    input.scheme?.trim() || 'Not applicable.',
    '',
    'Failing fixture:',
    input.failingFixture === undefined
      ? 'No failing fixture was reported.'
      : JSON.stringify(input.failingFixture, null, 2),
    '',
    'Current item JSON:',
    input.itemJson.trim(),
    '',
    'Return exactly one revised item inside this complete single-item batch block, with no Markdown fence or explanation:',
    BATCH_OUTPUT_START,
    '{',
    '  "version": 2,',
    '  "items": [',
    '    { "kind": "numeric or working", "question": "Revised question and fields" }',
    '  ]',
    '}',
    BATCH_OUTPUT_END,
  ].join('\n');
}
