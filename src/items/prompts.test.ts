import { describe, expect, it } from 'vitest';
import {
  BATCH_OUTPUT_END,
  BATCH_OUTPUT_START,
  buildBatchGenerationPrompt,
  buildBatchRevisionPrompt,
  buildItemRevisionPrompt,
  buildMarkSchemeDraftPrompt,
} from './prompts';
import {
  MARK_SCHEME_PREDICATES,
  MARK_SCHEME_SYNTAX_EXAMPLES,
  compileMarkScheme,
  markSchemeSyntaxSpecification,
} from './markSchemeCompiler';
import { parseBatchOutput } from './batchStaging';

describe('mark-scheme authoring prompt', () => {
  it('contains the question and compiler-owned grammar specification', () => {
    const prompt = buildMarkSchemeDraftPrompt('Solve 2x = 8.');

    expect(prompt).toContain('Solve 2x = 8.');
    expect(prompt).toContain(markSchemeSyntaxSpecification());
    for (const predicate of MARK_SCHEME_PREDICATES) expect(prompt).toContain(predicate);
  });

  it('keeps every canonical prompt example accepted by the compiler', () => {
    for (const example of MARK_SCHEME_SYNTAX_EXAMPLES) {
      expect(compileMarkScheme(example).lines[0]?.kind).toBe('compiled');
    }
  });
});

describe('batch authoring prompt', () => {
  it('includes inputs, clarification discipline and the delimited output shape', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Price rises reduce quantity demanded.',
      topic: 'Demand',
      level: 'A level',
    });

    expect(prompt).toContain('Price rises reduce quantity demanded.');
    expect(prompt).toContain('Topic: Demand');
    expect(prompt).toContain('Level: A level');
    expect(prompt).toContain('no more than three');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(prompt).toContain(BATCH_OUTPUT_END);
    expect(prompt).toContain('"fixtures"');
    expect(prompt).toContain('Every fixture must actually earn its expectedMarks');
    expect(prompt).toContain('Do not add prose labels or units');
    expect(prompt).toContain('One answer means one value');
    expect(prompt).toContain('never "[1] answer :: equals :: x=6,y=4"');
    expect(prompt).toContain('durable concept checks');
    expect(prompt).toContain('deriving the quadratic formula from ax^2 + bx + c = 0');
    expect(prompt).toContain('If any variable or equals sign remains, it is not numeric');
    expect(prompt).toContain('recall or state a formula');
    expect(prompt).toContain('change the item to working or omit it');
    expect(prompt).toContain('"studentAnswer": ["x^2 + b*x = -c", "(x + b/2)^2 = b^2/4 - c"]');
    expect(prompt).not.toContain('"studentAnswer": ["working line", "4"]');
  });

  it('injects optional item-count and concept-density constraints without a hard cap', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Notes',
      topic: 'Topic',
      level: 'Level',
      maxItems: 500,
      conceptsPerItem: 2,
    });

    expect(prompt).toContain('Requested maximum items: 500');
    expect(prompt).toContain('Target concept density: 2 atomic concepts per item');
  });

  it('includes course provenance only when supplied', () => {
    const withProvenance = buildBatchGenerationPrompt({
      notes: 'Notes',
      topic: 'Topic',
      level: 'Level',
      examBoard: ' AQA ',
      specification: ' 7136 ',
    });
    const withoutProvenance = buildBatchGenerationPrompt({
      notes: 'Notes',
      topic: 'Topic',
      level: 'Level',
    });

    expect(withProvenance).toContain('Exam board: AQA');
    expect(withProvenance).toContain('Specification: 7136');
    expect(withoutProvenance).not.toContain('Exam board:');
    expect(withoutProvenance).not.toContain('Specification:');
  });

  it('keeps the symbolic example valid with a passing fixture', () => {
    const result = parseBatchOutput(
      buildBatchGenerationPrompt({ notes: 'Notes', topic: 'Algebra', level: 'GCSE' }),
    );

    expect(result.error).toBeNull();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate) => candidate.errors.length === 0)).toBe(true);
    expect(result.candidates[0]?.fixtureStatus).toEqual({ total: 1, passed: 1 });
  });

  it('lets the model choose both constraints', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Dense notes',
      topic: 'Topic',
      level: 'Level',
    });

    expect(prompt).toContain('Concepts per item: model-selected');
    expect(prompt).toContain('Requested maximum items: model-selected');
    expect(prompt).not.toContain('Never return more than');
  });
});

describe('batch revision prompt', () => {
  it('carries every failing item with its errors and pins the order and count', () => {
    const prompt = buildBatchRevisionPrompt({
      items: [
        { itemJson: '{"kind":"working","question":"First"}', validationErrors: ['Fixture 1 failed.'] },
        { itemJson: '{"kind":"numeric","question":"Second"}', validationErrors: [] },
      ],
      complaint: 'Keep the wording shorter.',
    });

    expect(prompt).toContain('Revise the 2 Lacuna v1 items');
    expect(prompt).toContain('Return exactly 2 items, in the same order');
    expect(prompt).toContain('--- Item 1 of 2 ---');
    expect(prompt).toContain('--- Item 2 of 2 ---');
    expect(prompt).toContain('Fixture 1 failed.');
    expect(prompt).toContain('No validation error was reported.');
    expect(prompt).toContain('Keep the wording shorter.');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(prompt).toContain(BATCH_OUTPUT_END);
  });

  it('reads naturally for one item and omits an absent complaint', () => {
    const prompt = buildBatchRevisionPrompt({
      items: [{ itemJson: '{"kind":"numeric"}', validationErrors: ['Bad answer.'] }],
    });

    expect(prompt).toContain('Revise the 1 Lacuna v1 item below');
    expect(prompt).toContain('Return exactly 1 item, in the same order');
    expect(prompt).not.toContain('Tutor complaint');
  });
});

describe('item revision prompt', () => {
  it('includes the item, scheme, failing fixture and tutor complaint', () => {
    const prompt = buildItemRevisionPrompt({
      itemJson: '{"kind":"working","question":"Calculate revenue"}',
      scheme: '[1] revenue :: equals :: 1120',
      failingFixture: { studentAnswer: ['1000'], expectedMarks: 1 },
      complaint: 'Accept the correctly calculated quantity before revenue.',
      validationErrors: ['Fixture 1 expected 1 mark but received 0.'],
    });

    expect(prompt).toContain('{"kind":"working","question":"Calculate revenue"}');
    expect(prompt).toContain('[1] revenue :: equals :: 1120');
    expect(prompt).toContain('"studentAnswer": [');
    expect(prompt).toContain('Accept the correctly calculated quantity before revenue.');
    expect(prompt).toContain('Fixture 1 expected 1 mark but received 0.');
    expect(prompt).toContain('If any variable or equals sign remains, it is not numeric');
    expect(prompt).toContain('recall or state a formula');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(prompt).toContain(BATCH_OUTPUT_END);
  });
});
