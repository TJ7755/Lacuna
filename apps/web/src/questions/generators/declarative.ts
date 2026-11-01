import type { DeclarativeQuestionFamily } from '@lacuna/core/questions/bankSchema';
import type { QuestionAnswer, QuestionSetQuestion } from '@lacuna/core/questions/questionSets';

export function canonicalBankJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalBankJson).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row)
    .filter((key) => row[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalBankJson(row[key])}`)
    .join(',')}}`;
}

/** Deterministic identity checksum; never used as a security boundary. */
export function bankFingerprint(value: unknown): string {
  const serialised = canonicalBankJson(value);
  let first = 2166136261;
  let second = 3339675911;
  for (let index = 0; index < serialised.length; index++) {
    first = Math.imul(first ^ serialised.charCodeAt(index), 16777619);
    second = Math.imul(second ^ serialised.charCodeAt(index), 2246822519);
  }
  return `bank-v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function presentationResponse(answer?: QuestionAnswer) {
  const response = answer?.response;
  return response?.kind === 'multiple-choice'
    ? {
        kind: response.kind,
        selection: response.selection,
        options: response.options.map((option) => option.content),
      }
    : response?.kind;
}

/** Visible content defines novelty; answers, marking and authoring identities do not. */
export function questionPresentationFingerprint(question: QuestionSetQuestion): string {
  return JSON.stringify({
    prompt: question.prompt,
    response: presentationResponse(question.answer),
    parts: question.parts.map((part) => ({
      prompt: part.prompt,
      response: presentationResponse(part.answer),
      subparts: part.subparts.map((subpart) => ({
        prompt: subpart.prompt,
        response: presentationResponse(subpart.answer),
      })),
    })),
  });
}

export function familyPresentationRevision(
  family: DeclarativeQuestionFamily,
  questionId: string,
): string {
  const question = family.template.questions.find((row) => row.id === questionId);
  if (!question) throw new Error('Family Question not found.');
  const presentation = questionPresentationFingerprint(question);
  const variables = new Set(
    [...presentation.matchAll(/\{\{([a-z][a-zA-Z0-9_]*)\}\}/g)].map((match) => match[1]),
  );
  // Derived variables are ordered. Follow only dependencies that affect visible content.
  for (const expression of [...family.derived].reverse()) {
    if (!variables.has(expression.name)) continue;
    for (const operand of [expression.left, expression.right]) {
      if (typeof operand === 'string') variables.add(operand);
    }
  }
  return bankFingerprint({
    parameters: family.parameters,
    derived: family.derived.filter((expression) => variables.has(expression.name)),
    presentation,
  });
}

export function mapBankQuestions(
  questions: QuestionSetQuestion[],
  mapText: (text: string) => string,
  mapConcept: (id: string) => string = (id) => id,
): QuestionSetQuestion[] {
  const mapped = structuredClone(questions);
  for (const question of mapped) {
    const nodes = [question, ...question.parts.flatMap((part) => [part, ...part.subparts])];
    for (const node of nodes) {
      node.prompt = mapText(node.prompt);
      if (!node.answer) continue;
      node.answer.prerequisiteConceptIds = node.answer.prerequisiteConceptIds.map(mapConcept);
      for (const allocation of node.answer.allocations) {
        allocation.criterion = mapText(allocation.criterion);
        if (allocation.explanation !== undefined)
          allocation.explanation = mapText(allocation.explanation);
        allocation.targetConceptIds = allocation.targetConceptIds.map(mapConcept);
      }
      if (node.answer.response.kind === 'multiple-choice') {
        for (const option of node.answer.response.options) option.content = mapText(option.content);
      }
    }
  }
  return mapped;
}

export interface DeclarativeVariant {
  index: number;
  parameters: Record<string, number>;
  title: string;
  questions: QuestionSetQuestion[];
}

export function declarativeFamilyCapacity(family: DeclarativeQuestionFamily): number {
  return Object.values(family.parameters).reduce((count, values) => count * values.length, 1);
}

export function materialiseDeclarativeFamily(
  family: DeclarativeQuestionFamily,
  requestedIndex?: number,
): DeclarativeVariant[] {
  const entries = Object.entries(family.parameters).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  if (!entries.length) throw new Error('A family requires at least one parameter.');
  let combinations: Record<string, number>[] = [{}];
  let capacity = 1;
  if (
    requestedIndex !== undefined &&
    (!Number.isInteger(requestedIndex) ||
      requestedIndex < 0 ||
      requestedIndex >= declarativeFamilyCapacity(family))
  )
    throw new Error('Family variant index is out of range.');
  for (const [name, values] of entries) {
    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate parameter values: ${name}.`);
    capacity *= values.length;
    if (capacity > 1000) throw new Error('A family may contain at most 1000 variants.');
    if (requestedIndex === undefined)
      combinations = combinations.flatMap((parameters) =>
        values.map((value) => ({ ...parameters, [name]: value })),
      );
    else {
      const divisor = declarativeFamilyCapacity(family) / capacity;
      combinations[0][name] = values[Math.floor(requestedIndex / divisor) % values.length];
    }
  }
  const presentations = new Set<string>();
  const selected = combinations;
  return selected.map((parameters, selectedIndex) => {
    const index = requestedIndex ?? selectedIndex;
    const values = { ...parameters };
    const operand = (value: string | number): number => {
      if (typeof value === 'number') return value;
      if (!Object.hasOwn(values, value)) throw new Error(`Unknown arithmetic operand: ${value}.`);
      return values[value];
    };
    for (const expression of family.derived) {
      if (Object.hasOwn(values, expression.name))
        throw new Error(`Duplicate variable: ${expression.name}.`);
      const left = operand(expression.left);
      const right = operand(expression.right);
      let result: number;
      switch (expression.op) {
        case '+':
          result = left + right;
          break;
        case '-':
          result = left - right;
          break;
        case '*':
          result = left * right;
          break;
        case '/':
          if (right === 0) throw new Error('Division by zero in Question family.');
          result = left / right;
          break;
        case '^':
          if (!Number.isInteger(right) || right < 0 || right > 8)
            throw new Error('Family exponent must be an integer between 0 and 8.');
          result = left ** right;
          break;
      }
      if (!Number.isFinite(result) || Math.abs(result) > 1e12)
        throw new Error('Family arithmetic exceeded its numeric bound.');
      values[expression.name] = Object.is(result, -0) ? 0 : result;
    }
    const substitute = (text: string) => {
      const rendered = text.replace(/\{\{([a-z][a-zA-Z0-9_]*)\}\}/g, (_match, name: string) => {
        if (!Object.hasOwn(values, name)) throw new Error(`Unknown template variable: ${name}.`);
        return String(values[name]);
      });
      if (rendered.includes('{{') || rendered.includes('}}'))
        throw new Error('Malformed family substitution.');
      return rendered;
    };
    const title = substitute(family.template.title);
    const questions = mapBankQuestions(family.template.questions, substitute);
    const presentation = canonicalBankJson(questions.map(questionPresentationFingerprint));
    if (presentations.has(presentation))
      throw new Error('Family variants must have distinct Question presentations.');
    presentations.add(presentation);
    return { index, parameters, title, questions };
  });
}
